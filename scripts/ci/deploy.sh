#!/usr/bin/env bash
# Uploads /tmp/<APP>-<VERSION>.tgz, installs it as a new release directory, switches the
# `current` symlink, restarts PM2 and verifies /api/version. Rolls the symlink back on failure.
set -euo pipefail

for v in APP VERSION PM2_NAME PORT DOTENV_PRIVATE_KEY_PRODUCTION SSH_PRIVATE_KEY SERVER_KNOWN_HOST SERVER_HOST SERVER_USER SERVER_PATH SERVER_SSH_PORT; do
  [ -n "${!v:-}" ] || { echo "ERROR: $v is empty"; exit 1; }
done
case "$SERVER_PATH" in
  ""|"/"|"."|".."|"~"|"/home"|"/root"|*".."*|*"//"*) echo "ERROR: unsafe SERVER_PATH '$SERVER_PATH'"; exit 1 ;;
esac

mkdir -p ~/.ssh
printf '%s\n' "$SSH_PRIVATE_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "$SERVER_KNOWN_HOST" >> ~/.ssh/known_hosts
SSH="ssh -p $SERVER_SSH_PORT -i $HOME/.ssh/deploy_key -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts $SERVER_USER@$SERVER_HOST"

TGZ="/tmp/${APP}-${VERSION}.tgz"
REL="$SERVER_PATH/releases/$VERSION"

echo "==> upload $TGZ to $REL"
$SSH "set -e; mkdir -p '$REL' '$SERVER_PATH/data'; tar -xzf - -C '$REL'" < "$TGZ"

echo "==> link data and .env.keys into the release"
printf 'DOTENV_PRIVATE_KEY_PRODUCTION=%s\n' "$DOTENV_PRIVATE_KEY_PRODUCTION" | $SSH "umask 077; cat > '$SERVER_PATH/.env.keys'"
$SSH "set -e; ln -sfn ../../data '$REL/data'; ln -sfn ../../.env.keys '$REL/.env.keys'; /usr/local/bin/pm2-chown-tree '$SERVER_PATH'"

PREVIOUS=$($SSH "readlink '$SERVER_PATH/current' 2>/dev/null || true")
echo "==> previous release: ${PREVIOUS:-none}"

echo "==> switch current -> releases/$VERSION"
$SSH "set -e; ln -sfn 'releases/$VERSION' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'"

echo "==> restart $PM2_NAME"
$SSH "/usr/local/bin/pm2-restart-safe '$PM2_NAME'"

echo "==> verify"
ok=false
for i in $(seq 1 30); do
  got=$($SSH "curl -fsS --max-time 3 http://127.0.0.1:$PORT/api/version" 2>/dev/null || true)
  if [ "$got" = "{\"version\":\"$VERSION\"}" ]; then ok=true; break; fi
  sleep 2
done
if [ "$ok" != true ]; then
  echo "ERROR: $PM2_NAME did not report version $VERSION (last response: ${got:-none})"
  if [ -n "$PREVIOUS" ]; then
    echo "==> rolling back to $PREVIOUS"
    $SSH "set -e; ln -sfn '$PREVIOUS' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'; /usr/local/bin/pm2-restart-safe '$PM2_NAME'"
  fi
  exit 1
fi
echo "==> $PM2_NAME is serving $VERSION"

echo "==> prune old releases (keep 3)"
$SSH "cd '$SERVER_PATH/releases' && ls -1t | tail -n +4 | xargs -r rm -rf"
