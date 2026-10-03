#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

release_sha=${1:?Usage: deploy.sh COMMIT_SHA}
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid commit SHA" >&2; exit 1; }
cd "$(dirname "$0")"
deploy_root=$(cd .. && pwd)
exec 9>"$deploy_root/deploy.lock"
flock -n 9 || { echo "Another deployment is running" >&2; exit 1; }
export RELEASE_SHA="$release_sha"
if [[ -d "$PWD/.docker" ]]; then
  export DOCKER_CONFIG="$PWD/.docker"
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi
compose=(docker compose --env-file "$deploy_root/.env" -f compose.yml)
"${compose[@]}" config --quiet
"${compose[@]}" pull

previous_dir=""
if [[ -L "$deploy_root/current" ]]; then
  previous_dir=$(readlink -f "$deploy_root/current")
fi

restore_previous() {
  local failure=$?
  trap - ERR
  if [[ -n "$previous_dir" ]]; then
    echo "Deployment failed; restoring previous application images. Database migrations are retained." >&2
    RELEASE_SHA=$(basename "$previous_dir") docker compose \
      --env-file "$deploy_root/.env" -f "$previous_dir/compose.yml" \
      up -d --remove-orphans --wait --wait-timeout 120 || true
  else
    echo "First deployment failed; inspect container logs before retrying." >&2
  fi
  exit "$failure"
}
trap restore_previous ERR

"${compose[@]}" up -d postgres --wait --wait-timeout 120
mkdir -p "$deploy_root/backups"
"${compose[@]}" exec -T postgres pg_dump -U industrial -d industrial_monitoring -Fc \
  > "$deploy_root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release_sha.dump"
"${compose[@]}" stop api simulator
"${compose[@]}" run --rm --no-deps api alembic upgrade head
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 180
# This reads through the repository and proves migrations/database connectivity.
"${compose[@]}" exec -T api python -c \
  "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/api/pages/demo/published', timeout=5)"
curl --fail --silent http://127.0.0.1:8081/api/health
[[ $(curl --silent -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/editor/demo) == 401 ]]
[[ $(curl --silent -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8081/api/telemetry) == 404 ]]
ln -sfn "$PWD" "$deploy_root/current"
echo "Deployed $release_sha. Backups retained in $deploy_root/backups."
