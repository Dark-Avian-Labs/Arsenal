#!/usr/bin/env bash
# Interactive VPS cutover script: consolidates Codex, Armory, Outfitter, and BudgetPlanner
# into the unified Arsenal PM2 service on port 3000 (leaving Sentinel standalone on port 3005).
set -euo pipefail

ARSENAL_ROOT="${ARSENAL_ROOT:-/var/www/arsenal}"
CODEX_ROOT="${CODEX_ROOT:-/var/www/codex}"
ARMORY_ROOT="${ARMORY_ROOT:-/var/www/armory}"
OUTFITTER_ROOT="${OUTFITTER_ROOT:-/var/www/outfitter}"
BUDGET_ROOT="${BUDGET_ROOT:-/var/www/budget-planner}"
BACKUP_DIR="/var/backups/arsenal-migration-$(date -u +%Y%m%d-%H%M%S)"

echo "=== Arsenal Monolith Cutover ==="
echo "Target unified root : $ARSENAL_ROOT"
echo "Backup destination  : $BACKUP_DIR"
echo ""
read -r -p "Proceed with stopping legacy services, backup, and data consolidation? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

mkdir -p "$BACKUP_DIR" "$ARSENAL_ROOT/data/images/warframe" "$ARSENAL_ROOT/data/images/wor"

echo "==> 1/5 Stopping legacy PM2 processes first so SQLite files are quiescent (Sentinel stays running)"
for proc in Codex Armory Outfitter BudgetPlanner; do
  sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper stop "$proc" 2>/dev/null || true
done

for port in 3001 3002 3003 3004; do
  for _ in $(seq 1 15); do
    if ! curl -fsS --max-time 1 -o /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  if curl -fsS --max-time 1 -o /dev/null "http://127.0.0.1:$port/healthz" 2>/dev/null; then
    echo "ERROR: legacy service on port $port is still responding after stop; aborting before backup."
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

# Use SQLite VACUUM INTO via Node 26 built-in node:sqlite so any uncheckpointed WAL frames
# are cleanly consolidated into a self-contained database file.
copy_db() {
  local src="$1"
  local dst="$2"
  if [ -f "$src" ]; then
    rm -f "$dst" "${dst}-wal" "${dst}-shm"
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
copy_db "$CODEX_ROOT/data/warframe-catalog.db" "$ARSENAL_ROOT/data/warframe-catalog.db"
copy_db "$CODEX_ROOT/data/epic7.db" "$ARSENAL_ROOT/data/epic7.db"
copy_db "$CODEX_ROOT/data/wor.db" "$ARSENAL_ROOT/data/wor.db"
copy_db "$CODEX_ROOT/data/wor-catalog.db" "$ARSENAL_ROOT/data/wor-catalog.db"
copy_db "$ARMORY_ROOT/data/builds.db" "$ARSENAL_ROOT/data/builds.db"
copy_db "$OUTFITTER_ROOT/data/outfitter.db" "$ARSENAL_ROOT/data/outfitter.db"
copy_db "$BUDGET_ROOT/data/app.db" "$ARSENAL_ROOT/data/budget.db"

if [ -d "$CODEX_ROOT/data/warframe-images" ]; then
  cp -a "$CODEX_ROOT/data/warframe-images/." "$ARSENAL_ROOT/data/images/warframe/"
elif [ -d "$ARMORY_ROOT/data/images" ]; then
  cp -a "$ARMORY_ROOT/data/images/." "$ARSENAL_ROOT/data/images/warframe/"
fi

if [ -d "$CODEX_ROOT/data/wor-images" ]; then
  cp -a "$CODEX_ROOT/data/wor-images/." "$ARSENAL_ROOT/data/images/wor/"
elif [ -d "$OUTFITTER_ROOT/data/hero-images" ]; then
  cp -a "$OUTFITTER_ROOT/data/hero-images/." "$ARSENAL_ROOT/data/images/wor/"
fi

echo "==> 4/5 Update Caddyfile to route all 4 subdomains to 127.0.0.1:3000"
cat <<'CADDY'

    codex.darkavianlabs.com,
    armory.darkavianlabs.com,
    outfitter.darkavianlabs.com,
    budget.darkavianlabs.com {
      reverse_proxy 127.0.0.1:3000
    }

    # Sentinel stays isolated on its own port:
    sentinel.darkavianlabs.com {
      reverse_proxy 127.0.0.1:3005
    }

CADDY

echo "==> 5/5 Next steps:"
echo "  1. Place unified .env.production and .env.keys in $ARSENAL_ROOT"
echo "  2. Update Caddyfile as shown above and run: sudo systemctl reload caddy"
echo "  3. Deploy Arsenal via Forgejo Actions (deploy.yml) and verify http://127.0.0.1:3000/readyz"
echo "  4. Once verified, delete the stopped legacy PM2 entries: pm2 delete Codex Armory Outfitter BudgetPlanner && pm2 save"
