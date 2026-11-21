#!/usr/bin/env bash
set -euo pipefail

for v in CATALOG_TGZ PM2_NAME PORT SSH_PRIVATE_KEY SERVER_KNOWN_HOST SERVER_HOST SERVER_USER SERVER_PATH SERVER_SSH_PORT; do
  [ -n "${!v:-}" ] || { echo "ERROR: $v is empty"; exit 1; }
done
case "$SERVER_PATH" in
  ""|"/"|"."|".."|"~"|"/home"|"/root"|*".."*|*"//"*) echo "ERROR: unsafe SERVER_PATH '$SERVER_PATH'"; exit 1 ;;
esac

mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "$SERVER_KNOWN_HOST" >> ~/.ssh/known_hosts

DEPLOY_HOST="$SERVER_HOST"
if getent hosts host.containers.internal >/dev/null 2>&1 && timeout 5 bash -c "</dev/tcp/host.containers.internal/$SERVER_SSH_PORT" 2>/dev/null; then
  DEPLOY_HOST=host.containers.internal
fi
echo "==> catalog deploy target: ${DEPLOY_HOST/#$SERVER_HOST/SERVER_HOST}"
SSH="ssh -p $SERVER_SSH_PORT -i $HOME/.ssh/deploy_key -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts $SERVER_USER@$DEPLOY_HOST"

DATA_DIR="$SERVER_PATH/data"
RUN_ID="$(date -u +%Y%m%d%H%M%S)-$$"
STAGE="$DATA_DIR/.catalog-incoming-$RUN_ID"
LOCK_FILE="$SERVER_PATH/.deploy.lock"
FORCE_SWAP="${FORCE_SWAP:-false}"

# Pre-flight manifest check: skip uploading the entire payload tarball when neither
# databases nor images changed compared to the deployed catalog-manifest.json.
if [ "$FORCE_SWAP" != "true" ]; then
  LOCAL_MANIFEST="$(tar -xzf "$CATALOG_TGZ" -O ./catalog-manifest.json 2>/dev/null || tar -xzf "$CATALOG_TGZ" -O catalog-manifest.json 2>/dev/null || true)"
  REMOTE_MANIFEST="$($SSH "cat '$DATA_DIR/catalog-manifest.json' 2>/dev/null || true")"
  if [ -n "$LOCAL_MANIFEST" ] && [ -n "$REMOTE_MANIFEST" ]; then
    SKIP_UPLOAD="$(node --input-type=module -e '
      const [localRaw, remoteRaw] = process.argv.slice(1);
      try {
        const local = JSON.parse(localRaw);
        const remote = JSON.parse(remoteRaw);
        const games = Array.isArray(local.games) ? local.games : [];
        if (games.length === 0) process.exit(0);
        for (const [db, info] of Object.entries(local.databases ?? {})) {
          const prev = remote?.databases?.[db];
          const nextHash = info?.contentHash ?? info?.sha256;
          const prevHash = prev?.contentHash ?? prev?.sha256;
          if (!nextHash || nextHash !== prevHash) process.exit(0);
        }
        for (const [game, nextImgHash] of Object.entries(local.imageHashes ?? {})) {
          const prevImgHash = remote?.imageHashes?.[game];
          if (!nextImgHash || nextImgHash !== prevImgHash) process.exit(0);
        }
        process.stdout.write("true");
      } catch {
        // Parse error -> proceed with normal upload & swap.
      }
    ' "$LOCAL_MANIFEST" "$REMOTE_MANIFEST")"
    if [ "$SKIP_UPLOAD" = "true" ]; then
      echo "==> catalog databases and images unchanged; skipping upload and PM2 restart (zero downtime)"
      exit 0
    fi
  fi
fi

echo "==> upload $CATALOG_TGZ to $STAGE"
$SSH "umask 007; set -e; mkdir -p '$STAGE'; tar -xzf - -C '$STAGE'" < "$CATALOG_TGZ"

echo "==> acquire deploy lock, check manifest diff, swap changed catalog DBs with rollback"
$SSH "set -euo pipefail
  mkdir -p '$DATA_DIR/images'
  exec 9>'$LOCK_FILE'
  flock -w 180 9
  cleanup() { rm -rf '$STAGE'; }
  trap cleanup EXIT

  # Always sync any newly added image files (non-destructive, zero downtime).
  if [ -d '$STAGE/images/warframe' ]; then
    mkdir -p '$DATA_DIR/images/warframe'
    cp -a '$STAGE/images/warframe/.' '$DATA_DIR/images/warframe/'
  fi
  if [ -d '$STAGE/images/wor' ]; then
    mkdir -p '$DATA_DIR/images/wor'
    cp -a '$STAGE/images/wor/.' '$DATA_DIR/images/wor/'
  fi

  # Determine whether any staged database actually changed compared to catalog-manifest.json.
  CHANGED_DBS=\$(node --input-type=module -e '
    import fs from \"node:fs\";
    const [stageDir, dataDir, forceSwap] = process.argv.slice(1);
    const readJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, \"utf8\")) : null);
    const incoming = readJson(\`\${stageDir}/catalog-manifest.json\`);
    const current = readJson(\`\${dataDir}/catalog-manifest.json\`);
    const changed = [];
    for (const db of [\"warframe-catalog.db\", \"wor-catalog.db\"]) {
      if (!fs.existsSync(\`\${stageDir}/\${db}\`)) continue;
      if (forceSwap === \"true\" || !fs.existsSync(\`\${dataDir}/\${db}\`)) {
        changed.push(db);
        continue;
      }
      const nextHash = incoming?.databases?.[db]?.contentHash ?? incoming?.databases?.[db]?.sha256;
      const prevHash = current?.databases?.[db]?.contentHash ?? current?.databases?.[db]?.sha256;
      if (!nextHash || nextHash !== prevHash) changed.push(db);
    }
    process.stdout.write(changed.join(\" \"));
  ' '$STAGE' '$DATA_DIR' '$FORCE_SWAP')

  if [ -z \"\$CHANGED_DBS\" ]; then
    if [ -f '$STAGE/catalog-manifest.json' ]; then
      mv -f '$STAGE/catalog-manifest.json' '$DATA_DIR/catalog-manifest.json'
    fi
    echo '==> catalog databases unchanged; skipping PM2 restart (zero downtime)'
    exit 0
  fi

  echo \"==> databases changed: \$CHANGED_DBS — stopping $PM2_NAME\"
  if ! sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper stop '$PM2_NAME'; then
    echo 'ERROR: failed to stop $PM2_NAME; aborting catalog swap before touching DB files'
    exit 1
  fi

  stopped=false
  for _ in \$(seq 1 15); do
    if ! curl -fsS --max-time 1 -o /dev/null 'http://127.0.0.1:$PORT/healthz' 2>/dev/null; then
      stopped=true
      break
    fi
    sleep 1
  done
  if [ \"\$stopped\" != true ]; then
    echo 'ERROR: $PM2_NAME is still responding on /healthz after stop; aborting catalog swap'
    exit 1
  fi

  # Back up previous DBs and manifest so we can roll back if /readyz fails.
  for db in \$CHANGED_DBS; do
    if [ -f '$DATA_DIR/'\"\$db\" ]; then
      cp -a '$DATA_DIR/'\"\$db\" '$DATA_DIR/'\"\$db\"'.prev'
    fi
    mv -f '$STAGE/'\"\$db\" '$DATA_DIR/'\"\$db\"
    touch '$DATA_DIR/'\"\$db\"
    rm -f '$DATA_DIR/'\"\$db\"'-wal' '$DATA_DIR/'\"\$db\"'-shm'
  done

  if [ -f '$DATA_DIR/catalog-manifest.json' ]; then
    cp -a '$DATA_DIR/catalog-manifest.json' '$DATA_DIR/catalog-manifest.json.prev'
  fi
  if [ -f '$STAGE/catalog-manifest.json' ]; then
    mv -f '$STAGE/catalog-manifest.json' '$DATA_DIR/catalog-manifest.json'
  fi

  # Starting Arsenal runs boot-time catalog-to-collection sync before /readyz passes.
  sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper restart '$PM2_NAME'

  ok=false
  for _ in \$(seq 1 30); do
    if curl -fsS --max-time 3 -o /dev/null 'http://127.0.0.1:$PORT/readyz' 2>/dev/null; then
      ok=true
      break
    fi
    sleep 2
  done

  if [ \"\$ok\" != true ]; then
    echo 'ERROR: $PM2_NAME did not pass /readyz after catalog swap — rolling back .prev files'
    sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper stop '$PM2_NAME' || true
    for db in \$CHANGED_DBS; do
      if [ -f '$DATA_DIR/'\"\$db\"'.prev' ]; then
        mv -f '$DATA_DIR/'\"\$db\"'.prev' '$DATA_DIR/'\"\$db\"
        rm -f '$DATA_DIR/'\"\$db\"'-wal' '$DATA_DIR/'\"\$db\"'-shm'
      fi
    done
    if [ -f '$DATA_DIR/catalog-manifest.json.prev' ]; then
      mv -f '$DATA_DIR/catalog-manifest.json.prev' '$DATA_DIR/catalog-manifest.json'
    fi
    sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper restart '$PM2_NAME' || true
    exit 1
  fi

  for db in \$CHANGED_DBS; do
    rm -f '$DATA_DIR/'\"\$db\"'.prev'
  done
  rm -f '$DATA_DIR/catalog-manifest.json.prev'
"
echo "==> catalog swap complete and verified"
