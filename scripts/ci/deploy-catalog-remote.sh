#!/usr/bin/env bash
# Runs ON THE SERVER (piped over SSH by scripts/ci/deploy-catalog.sh as `bash -s -- ...`).
# Swaps changed catalog DBs into the Arsenal data dir under the deploy lock, restarts Arsenal,
# and rolls back to the previous DBs/manifest when /readyz fails.
#
# Only needs bash, coreutils, flock, curl and jq on the server (no Node.js: the deploy user
# has no node on PATH). Must not read stdin: stdin is this script.
set -euo pipefail
umask 007

STAGE="$1"
DATA_DIR="$2"
LOCK_FILE="$3"
PM2_NAME="$4"
PORT="$5"
FORCE_SWAP="${6:-false}"
PM2_WRAPPER=/home/pm2-user/bin/pm2-wrapper
MANIFEST="$DATA_DIR/catalog-manifest.json"
INCOMING_MANIFEST="$STAGE/catalog-manifest.json"
CATALOG_DBS=(warframe-catalog.db wor-catalog.db)

pm2() { sudo -n -u pm2-user "$PM2_WRAPPER" "$@" </dev/null; }

mkdir -p "$DATA_DIR/images"
exec 9>"$LOCK_FILE"
flock -w 180 9
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

# Merge the incoming manifest into the deployed one per DB / game, so a single-game run
# (game=wor or game=warframe) never drops the other game's entries.
merge_manifest() {
  [ -f "$INCOMING_MANIFEST" ] || return 0
  local current='{}'
  if [ -f "$MANIFEST" ] && jq -e . "$MANIFEST" >/dev/null 2>&1; then
    current="$(cat "$MANIFEST")"
  fi
  jq -n --argjson cur "$current" --slurpfile new "$INCOMING_MANIFEST" '
    ($new[0] // {}) as $n
    | $cur
    | .builtAt = ($n.builtAt // .builtAt)
    | .sha = ($n.sha // .sha)
    | .games = (((.games // []) + ($n.games // [])) | unique)
    | .databases = ((.databases // {}) + ($n.databases // {}))
    | .images = ((.images // {}) + ($n.images // {}))
    | .imageHashes = ((.imageHashes // {}) + ($n.imageHashes // {}))
  ' > "$MANIFEST.tmp"
  mv -f "$MANIFEST.tmp" "$MANIFEST"
}

db_hash() { # $1 manifest file, $2 db name -> contentHash (or sha256), empty when unknown
  [ -f "$1" ] || return 0
  jq -r --arg db "$2" '.databases[$db] // {} | (.contentHash // .sha256 // empty)' "$1" 2>/dev/null || true
}

# Always sync newly added image files (non-destructive, zero downtime).
for game in warframe wor; do
  if [ -d "$STAGE/images/$game" ]; then
    mkdir -p "$DATA_DIR/images/$game"
    cp -a "$STAGE/images/$game/." "$DATA_DIR/images/$game/"
  fi
done

# Which staged databases actually changed compared to the deployed manifest?
CHANGED_DBS=()
for db in "${CATALOG_DBS[@]}"; do
  [ -f "$STAGE/$db" ] || continue
  if [ "$FORCE_SWAP" = "true" ] || [ ! -f "$DATA_DIR/$db" ]; then
    CHANGED_DBS+=("$db")
    continue
  fi
  next="$(db_hash "$INCOMING_MANIFEST" "$db")"
  prev="$(db_hash "$MANIFEST" "$db")"
  if [ -z "$next" ] || [ "$next" != "$prev" ]; then
    CHANGED_DBS+=("$db")
  fi
done

if [ "${#CHANGED_DBS[@]}" -eq 0 ]; then
  merge_manifest
  echo "==> catalog databases unchanged; skipping PM2 restart (zero downtime)"
  exit 0
fi

echo "==> databases changed: ${CHANGED_DBS[*]} — stopping $PM2_NAME"
if ! pm2 stop "$PM2_NAME"; then
  echo "ERROR: failed to stop $PM2_NAME; aborting catalog swap before touching DB files"
  exit 1
fi

stopped=false
for _ in $(seq 1 15); do
  if ! curl -fsS --max-time 1 -o /dev/null "http://127.0.0.1:$PORT/healthz" 2>/dev/null; then
    stopped=true
    break
  fi
  sleep 1
done
if [ "$stopped" != true ]; then
  echo "ERROR: $PM2_NAME is still responding on /healthz after stop; restarting it and aborting catalog swap"
  pm2 restart "$PM2_NAME" || true
  exit 1
fi

# Back up previous DBs and manifest so we can roll back if /readyz fails.
for db in "${CHANGED_DBS[@]}"; do
  if [ -f "$DATA_DIR/$db" ]; then
    cp -a "$DATA_DIR/$db" "$DATA_DIR/$db.prev"
  fi
  mv -f "$STAGE/$db" "$DATA_DIR/$db"
  # tar preserves the build host's mtime; make the swapped file look new on the server.
  touch "$DATA_DIR/$db"
  rm -f "$DATA_DIR/$db-wal" "$DATA_DIR/$db-shm"
done

if [ -f "$MANIFEST" ]; then
  cp -a "$MANIFEST" "$MANIFEST.prev"
fi
merge_manifest

# Starting Arsenal runs boot-time catalog-to-collection sync before /readyz passes.
pm2 restart "$PM2_NAME"

ok=false
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 -o /dev/null "http://127.0.0.1:$PORT/readyz" 2>/dev/null; then
    ok=true
    break
  fi
  sleep 2
done

if [ "$ok" != true ]; then
  echo "ERROR: $PM2_NAME did not pass /readyz after catalog swap — rolling back .prev files"
  pm2 stop "$PM2_NAME" || true
  for db in "${CHANGED_DBS[@]}"; do
    if [ -f "$DATA_DIR/$db.prev" ]; then
      mv -f "$DATA_DIR/$db.prev" "$DATA_DIR/$db"
      touch "$DATA_DIR/$db"
      rm -f "$DATA_DIR/$db-wal" "$DATA_DIR/$db-shm"
    fi
  done
  if [ -f "$MANIFEST.prev" ]; then
    mv -f "$MANIFEST.prev" "$MANIFEST"
  fi
  pm2 restart "$PM2_NAME" || true
  exit 1
fi

for db in "${CHANGED_DBS[@]}"; do
  rm -f "$DATA_DIR/$db.prev"
done
rm -f "$MANIFEST.prev"
