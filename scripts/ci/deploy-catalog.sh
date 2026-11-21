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
# The remote half lives in deploy-catalog-remote.sh (piped as the script on stdin) so it can be
# linted and tested on its own, and needs only bash/flock/curl/jq on the server.
$SSH "bash -s -- '$STAGE' '$DATA_DIR' '$LOCK_FILE' '$PM2_NAME' '$PORT' '$FORCE_SWAP'" \
  < "$(dirname "$0")/deploy-catalog-remote.sh"
echo "==> catalog deploy finished"
