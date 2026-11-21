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
STAGE="$DATA_DIR/.catalog-incoming"

echo "==> upload $CATALOG_TGZ to $STAGE"
$SSH "umask 007; set -e; rm -rf '$STAGE'; mkdir -p '$STAGE'; tar -xzf - -C '$STAGE'" < "$CATALOG_TGZ"

echo "==> sync catalog images and swap immutable SQLite snapshots"
$SSH "set -e
  mkdir -p '$DATA_DIR/images'
  if [ -d '$STAGE/images/warframe' ]; then
    mkdir -p '$DATA_DIR/images/warframe'
    cp -a '$STAGE/images/warframe/.' '$DATA_DIR/images/warframe/'
  fi
  if [ -d '$STAGE/images/wor' ]; then
    mkdir -p '$DATA_DIR/images/wor'
    cp -a '$STAGE/images/wor/.' '$DATA_DIR/images/wor/'
  fi

  for db in warframe-catalog.db wor-catalog.db; do
    if [ -f '$STAGE/'\"\$db\" ]; then
      mv -f '$STAGE/'\"\$db\" '$DATA_DIR/'\"\$db\"
      rm -f '$DATA_DIR/'\"\$db\"'-wal' '$DATA_DIR/'\"\$db\"'-shm'
    fi
  done

  if [ -f '$STAGE/catalog-manifest.json' ]; then
    mv -f '$STAGE/catalog-manifest.json' '$DATA_DIR/catalog-manifest.json'
  fi
  rm -rf '$STAGE'
"

echo "==> restart $PM2_NAME to open fresh catalog DB inodes"
$SSH "sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper restart '$PM2_NAME'"

echo "==> verify /readyz on port $PORT"
ok=false
for i in $(seq 1 30); do
  if $SSH "curl -fsS --max-time 3 -o /dev/null http://127.0.0.1:$PORT/readyz" 2>/dev/null; then
    ok=true
    break
  fi
  sleep 2
done
if [ "$ok" != true ]; then
  echo "ERROR: $PM2_NAME did not pass /readyz after catalog swap"
  exit 1
fi
echo "==> catalog swap complete and verified"
