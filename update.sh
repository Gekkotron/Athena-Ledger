#!/bin/bash
set -e

cd "$(dirname "$0")"

BEFORE=$(git rev-parse HEAD)
git pull --rebase
AFTER=$(git rev-parse HEAD)

# Are both application containers already running? (db is an unchanged
# Postgres image and is not rebuilt here.)
BACKEND_RUNNING=$(docker compose ps -q backend 2>/dev/null)
FRONTEND_RUNNING=$(docker compose ps -q frontend 2>/dev/null)

if [ "$BEFORE" = "$AFTER" ] && [ -n "$BACKEND_RUNNING" ] && [ -n "$FRONTEND_RUNNING" ]; then
    echo "$(date): No changes and services already running, skipping rebuild."
    exit 0
fi

if [ "$BEFORE" = "$AFTER" ]; then
    echo "$(date): No code changes, but one or more services are not running — starting them."
else
    echo "$(date): Changes detected ($BEFORE -> $AFTER), rebuilding..."
fi

docker compose build --no-cache backend frontend
docker compose up -d --build

# Prune dangling images left over from --no-cache rebuilds.
docker image prune -f >/dev/null 2>&1 || true
echo "$(date): Dangling images pruned."

# One-shot cleanup of pre-Hoopoe image tags. docker compose derives image
# names from the project name (= lowercased dir name), so a build done
# before the rename lives on as `athena-ledger-{backend,frontend}:latest`
# even after you `mv` the checkout to Hoopoe/ and the new build lands as
# `hoopoe-*`. These no longer have a container pointing at them, so
# `docker image rm` without -f removes them cleanly; `|| true` keeps the
# script going when the image is missing (fresh install) or still in use
# (you're running update.sh before renaming the dir — the current build
# is itself tagged `athena-ledger-*` and `rm` refuses, as it should).
for legacy in athena-ledger-backend athena-ledger-frontend; do
  docker images --format '{{.Repository}}:{{.Tag}}' "$legacy" 2>/dev/null \
    | xargs -r docker image rm >/dev/null 2>&1 || true
done

echo "$(date): Update complete."
