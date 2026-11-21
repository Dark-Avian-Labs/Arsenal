#!/usr/bin/env bash
# Interactive VPS cutover script: consolidates Codex, Armory, Outfitter, and BudgetPlanner
# into the unified Arsenal PM2 service on $ARSENAL_PORT (default 3006; leaving Sentinel standalone on 3005).
# Port 3000 is NOT used in production: crowdsec-web-ui already listens on *:3000 on shockwave.
#
# Recommended order: run this cutover script FIRST to populate $ARSENAL_ROOT/data, then run
# the first Arsenal deploy (deploy.yml). If Arsenal was already deployed/registered, step 1
# stops it before replacing any SQLite files and restarts it after copying.
#
# Run as root (sudo) so the consolidated data can be handed to the PM2 user afterwards.
# Set ASSUME_YES=1 to skip the confirmation prompt.
set -euo pipefail

APPS_ROOT="${APPS_ROOT:-/var/www/applications}"
ARSENAL_ROOT="${ARSENAL_ROOT:-$APPS_ROOT/arsenal}"
CODEX_ROOT="${CODEX_ROOT:-$APPS_ROOT/codex}"
ARMORY_ROOT="${ARMORY_ROOT:-$APPS_ROOT/armory}"
OUTFITTER_ROOT="${OUTFITTER_ROOT:-$APPS_ROOT/outfitter}"
BUDGET_ROOT="${BUDGET_ROOT:-$APPS_ROOT/budget}"
ARSENAL_PORT="${ARSENAL_PORT:-3006}"
# Owner for the consolidated data dir (the PM2 user must be able to write the SQLite files).
ARSENAL_DATA_OWNER="${ARSENAL_DATA_OWNER:-pm2-user:web}"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/backups/arsenal-migration-$(date -u +%Y%m%d-%H%M%S)}"
PM2_WRAPPER="${PM2_WRAPPER:-/home/pm2-user/bin/pm2-wrapper}"

echo "=== Arsenal Monolith Cutover ==="
echo "Target unified root : $ARSENAL_ROOT"
echo "Legacy roots        : $CODEX_ROOT, $ARMORY_ROOT, $OUTFITTER_ROOT, $BUDGET_ROOT"
echo "Backup destination  : $BACKUP_DIR"
echo ""
if [ "${ASSUME_YES:-}" != "1" ]; then
  read -r -p "Proceed with stopping legacy services, backup, and data consolidation? [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }
fi

# Verify target directories are writable BEFORE stopping any running services.
mkdir -p "$BACKUP_DIR" "$ARSENAL_ROOT/data/images/warframe" "$ARSENAL_ROOT/data/images/wor"

STOPPED_LEGACY=false
rollback_legacy() {
  local exit_code=$?
  if [ "$STOPPED_LEGACY" = true ] && [ "$exit_code" -ne 0 ]; then
    echo ""
    echo "ERROR: Cutover failed (exit $exit_code). Restarting legacy PM2 processes so services stay up..."
    for proc in Codex Armory Outfitter BudgetPlanner; do
      sudo -n -u pm2-user "$PM2_WRAPPER" restart "$proc" 2>/dev/null || true
    done
  fi
}
trap rollback_legacy EXIT

echo "==> 1/5 Stopping legacy PM2 processes (and Arsenal if registered) so SQLite files are quiescent (Sentinel stays running)"
STOPPED_LEGACY=true
for proc in Arsenal Codex Armory Outfitter BudgetPlanner; do
  sudo -n -u pm2-user "$PM2_WRAPPER" stop "$proc" 2>/dev/null || true
done

for port in "$ARSENAL_PORT" 3001 3002 3003 3004; do
  for _ in $(seq 1 15); do
    if ! curl -fsS --max-time 1 -o /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if curl -fsS --max-time 1 -o /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null; then
    echo "ERROR: service on port $port is still responding after stop; aborting before backup/copy."
    exit 1
  fi
done

echo "==> 2/5 Backing up quiescent app data directories"
for pair in "codex:$CODEX_ROOT" "armory:$ARMORY_ROOT" "outfitter:$OUTFITTER_ROOT" "budget:$BUDGET_ROOT"; do
  name="${pair%%:*}"
  dir="${pair#*:}"
  if [ -d "$dir/data" ]; then
    tar -C "$dir" -czf "$BACKUP_DIR/${name}-data.tgz" data
    echo "    backed up $dir/data -> $BACKUP_DIR/${name}-data.tgz"
  fi
done

# Use SQLite VACUUM INTO so any uncheckpointed WAL frames are cleanly consolidated into a
# self-contained database file. Prefers the sqlite3 CLI; falls back to Node's node:sqlite.
copy_db() {
  local src="$1"
  local dst="$2"
  if [ -f "$src" ]; then
    rm -f "$dst" "${dst}-wal" "${dst}-shm"
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 -bail -cmd ".timeout 5000" "$src" "VACUUM INTO '${dst//\'/\'\'}'"
      echo "    snapshot $src -> $dst"
      return 0
    fi
    # shellcheck disable=SC2016
    node --input-type=module -e '
      import { DatabaseSync } from "node:sqlite";
      const [src, dst] = process.argv.slice(1);
      const db = new DatabaseSync(src);
      try {
        db.exec("PRAGMA busy_timeout = 5000");
        const sqlDst = dst.replaceAll("\x27", "\x27\x27");
        db.exec(`VACUUM INTO \x27${sqlDst}\x27`);
      } finally {
        db.close();
      }
    ' "$src" "$dst"
    echo "    snapshot $src -> $dst"
  else
    echo "    [skip] $src not found"
  fi
}

echo "==> 3/5 Consolidating SQLite databases & images into $ARSENAL_ROOT/data"
copy_db "$CODEX_ROOT/data/warframe.db" "$ARSENAL_ROOT/data/warframe.db"
# Catalogs: once the catalog-sync workflow has deployed CI-built snapshots (catalog-manifest.json
# present), keep those instead of regressing to the legacy Codex copies.
if [ -f "$ARSENAL_ROOT/data/catalog-manifest.json" ] && [ "${FORCE_CATALOG_COPY:-}" != "1" ]; then
  echo "    [keep] CI catalog snapshots present ($ARSENAL_ROOT/data/catalog-manifest.json); not copying legacy catalogs"
  COPY_CATALOGS=false
else
  COPY_CATALOGS=true
fi
if [ "$COPY_CATALOGS" = true ]; then
  copy_db "$CODEX_ROOT/data/warframe-catalog.db" "$ARSENAL_ROOT/data/warframe-catalog.db"
fi
copy_db "$CODEX_ROOT/data/epic7.db" "$ARSENAL_ROOT/data/epic7.db"
copy_db "$CODEX_ROOT/data/wor.db" "$ARSENAL_ROOT/data/wor.db"
if [ "$COPY_CATALOGS" = true ]; then
  copy_db "$CODEX_ROOT/data/wor-catalog.db" "$ARSENAL_ROOT/data/wor-catalog.db"
fi
copy_db "$ARMORY_ROOT/data/armory.db" "$ARSENAL_ROOT/data/armory.db"
copy_db "$ARMORY_ROOT/data/builds.db" "$ARSENAL_ROOT/data/builds.db"
copy_db "$OUTFITTER_ROOT/data/outfitter.db" "$ARSENAL_ROOT/data/outfitter.db"
copy_db "$BUDGET_ROOT/data/app.db" "$ARSENAL_ROOT/data/budget.db"

# Images: Codex's sets first, then merge in anything only Armory/Outfitter had (e.g. Armory's
# ability icons) without overwriting.
if [ -d "$CODEX_ROOT/data/warframe-images" ]; then
  cp -a "$CODEX_ROOT/data/warframe-images/." "$ARSENAL_ROOT/data/images/warframe/"
fi
if [ -d "$ARMORY_ROOT/data/images" ]; then
  cp -an "$ARMORY_ROOT/data/images/." "$ARSENAL_ROOT/data/images/warframe/"
fi
if [ -d "$CODEX_ROOT/data/wor-images" ]; then
  cp -a "$CODEX_ROOT/data/wor-images/." "$ARSENAL_ROOT/data/images/wor/"
fi
if [ -d "$OUTFITTER_ROOT/data/hero-images" ]; then
  cp -an "$OUTFITTER_ROOT/data/hero-images/." "$ARSENAL_ROOT/data/images/wor/"
fi

if [ "$(id -u)" = "0" ]; then
  chown -R "$ARSENAL_DATA_OWNER" "$ARSENAL_ROOT/data"
  chmod -R g+rwX "$ARSENAL_ROOT/data"
fi

# Start (or restart) Arsenal immediately if a release is already deployed at $ARSENAL_ROOT/current.
if [ -f "$ARSENAL_ROOT/current/ecosystem.config.cjs" ]; then
  echo "==> Starting unified Arsenal PM2 process from $ARSENAL_ROOT/current/ecosystem.config.cjs"
  if ! sudo -n -u pm2-user "$PM2_WRAPPER" restart Arsenal 2>/dev/null; then
    sudo -n -u pm2-user "$PM2_WRAPPER" start "$ARSENAL_ROOT/current/ecosystem.config.cjs"
  fi
  ok=false
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:$ARSENAL_PORT/readyz" 2>/dev/null; then
      ok=true
      break
    fi
    sleep 2
  done
  if [ "$ok" != true ]; then
    echo "ERROR: Arsenal did not pass /readyz on port $ARSENAL_PORT; rolling back to legacy PM2 apps."
    sudo -n -u pm2-user "$PM2_WRAPPER" stop Arsenal 2>/dev/null || true
    exit 1
  fi
  sudo -n -u pm2-user "$PM2_WRAPPER" save || true
  echo "    Arsenal is online and passing /readyz on 127.0.0.1:$ARSENAL_PORT"
else
  echo "==> NOTE: $ARSENAL_ROOT/current/ecosystem.config.cjs not found yet."
  echo "    Data is now consolidated in $ARSENAL_ROOT/data; run Forgejo deploy.yml next to deploy and start Arsenal."
fi

STOPPED_LEGACY=false

echo "==> 4/5 Update Caddyfile to route all 4 subdomains to 127.0.0.1:$ARSENAL_PORT"
cat <<CADDY

    # Keep each host's existing logging/crowdsec snippets; only the upstream port changes:
    codex.darkavianlabs.com      { ... import application $ARSENAL_PORT }
    armory.darkavianlabs.com     { ... import application $ARSENAL_PORT }
    budget.darkavianlabs.com     { ... import application $ARSENAL_PORT }
    outfitter.darkavianlabs.com  { ... import application $ARSENAL_PORT }

    # Sentinel stays isolated on its own port:
    sentinel.darkavianlabs.com   { ... import application 3005 }

CADDY
echo "==> 5/5 Next steps:"
echo "  1. Ensure encrypted apps/arsenal/.env.production is committed and Forgejo secrets SERVER_PATH_ARSENAL + DOTENV_PRIVATE_KEY_PRODUCTION_ARSENAL are set"
echo "  2. If Arsenal was not already started above, trigger deploy.yml (or run: sudo -u pm2-user $PM2_WRAPPER start $ARSENAL_ROOT/current/ecosystem.config.cjs && sudo -u pm2-user $PM2_WRAPPER save)"
echo "  3. Update Caddyfile as shown above and run: sudo systemctl reload caddy"
echo "  4. Once verified, delete the stopped legacy PM2 entries: pm2 delete Codex Armory Outfitter BudgetPlanner && pm2 save"
