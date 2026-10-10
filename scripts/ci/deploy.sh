#!/usr/bin/env bash
set -euo pipefail

for v in APP VERSION SHA PM2_NAME PORT DOTENV_PRIVATE_KEY_PRODUCTION SSH_PRIVATE_KEY SERVER_KNOWN_HOST SERVER_HOST SERVER_USER SERVER_PATH SERVER_SSH_PORT; do
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

SHORT=$(printf '%s' "$SHA" | cut -c1-7)
case "$SHORT" in
  *[!0-9a-fA-F]*|"") echo "ERROR: SHA '$SHA' is not hex"; exit 1 ;;
esac
TGZ="/tmp/${APP}-${VERSION}.tgz"
REL="$SERVER_PATH/releases/${VERSION}-${SHORT}"
STAGE="${REL}.incoming"

echo "==> upload $TGZ to $STAGE"
# 007: group-writable for pm2-user, not world-readable. .env.keys is 027 below.
# Extract beside the release dir. A same-version redeploy must not untar into the
# directory PM2 is serving.
$SSH "umask 007; set -e; rm -rf '$STAGE'; mkdir -p '$STAGE' '$SERVER_PATH/data'; tar -xzf - -C '$STAGE'" < "$TGZ"

echo "==> link data and .env.keys into the release"
printf 'DOTENV_PRIVATE_KEY_PRODUCTION=%s\n' "$DOTENV_PRIVATE_KEY_PRODUCTION" | $SSH "umask 027; cat > '$SERVER_PATH/.env.keys'"
$SSH "set -e; ln -sfn ../../data '$STAGE/data'; ln -sfn ../../.env.keys '$STAGE/.env.keys'"
$SSH "set -e
  if [ -d '$REL' ]; then
    rm -rf '${REL}.previous'
    mv '$REL' '${REL}.previous'
  fi
  if ! mv '$STAGE' '$REL'; then
    if [ -d '${REL}.previous' ]; then mv '${REL}.previous' '$REL'; fi
    exit 1
  fi
  rm -rf '${REL}.previous'
"

PREVIOUS=$($SSH "readlink '$SERVER_PATH/current' 2>/dev/null || true")
echo "==> previous release: ${PREVIOUS:-none}"

echo "==> switch current -> releases/${VERSION}-${SHORT}"
$SSH "set -e; ln -sfn 'releases/${VERSION}-${SHORT}' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'"

echo "==> restart $PM2_NAME"
$SSH "sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper restart '$PM2_NAME'"

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
    $SSH "set -e; ln -sfn '$PREVIOUS' '$SERVER_PATH/current.tmp'; mv -Tf '$SERVER_PATH/current.tmp' '$SERVER_PATH/current'; sudo -n -u pm2-user /home/pm2-user/bin/pm2-wrapper restart '$PM2_NAME'"
  fi
  exit 1
fi
echo "==> $PM2_NAME is serving $VERSION"

echo "==> prune old releases (keep 3)"
$SSH "cd '$SERVER_PATH/releases' && ls -1t | tail -n +4 | xargs -r rm -rf"
