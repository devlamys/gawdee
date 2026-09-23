#!/usr/bin/env bash
# Installed root-owned, but executed as gawdee-staging or gawdee-production.
set -Eeuo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin
umask 0027
environment=${1:?Usage: deploy.sh staging|production COMMIT_SHA}
sha=${2:?Missing commit SHA}
case "$environment" in
  staging) api_port=8002; frontend_port=3001 ;;
  production) api_port=8001; frontend_port=3000 ;;
  *) exit 2 ;;
esac
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA'; exit 2; }
[[ $(id -un) == "gawdee-$environment" ]] || { echo 'Wrong deployment user'; exit 2; }
base="/srv/gawdee/$environment"
archive="$base/incoming/$sha.tar.gz"
exec 9>"$base/shared/operations.lock"
flock -w 1800 9
test -s "$archive"
release="$base/releases/$sha-$(date -u +%Y%m%dT%H%M%S)-$RANDOM"
mkdir "$release"
tar -xzf "$archive" -C "$release" --no-same-owner --no-same-permissions
test -f "$release/backend/requirements.lock.txt"
test -f "$release/frontend/package-lock.json"
test ! -e "$release/backend/storage/gawdee.sqlite"
test ! -e "$release/backend/.env"
test ! -e "$release/frontend/.env.local"
test ! -e "$release/frontend/public/assets/uploads"
ln -s "$base/shared/backend.env" "$release/backend/.env"
ln -s "$base/shared/frontend.env" "$release/frontend/.env.production.local"
mkdir -p "$release/frontend/public/assets"
ln -s "$base/shared/public/assets/uploads" "$release/frontend/public/assets/uploads"

gawdee-python -m venv "$release/backend/.venv"
"$release/backend/.venv/bin/python" -m pip install -r "$release/backend/requirements.lock.txt"
(
  cd "$release/backend"
  .venv/bin/python -c 'from app.core.config import settings; print("Backend configuration valid")'
)
printf '%s\n' "$sha" > "$release/frontend/public/deploy-version.txt"
(
  cd "$release/frontend"
  npm ci --include=dev
  NODE_ENV=production npm run build
)

# Build failures above leave the running release untouched.
previous=''
if [[ -L "$base/current" ]]; then previous=$(readlink -f "$base/current"); fi
printf '%s\n' "$previous" > "$base/shared/previous-release.txt"
touch "$base/shared/maintenance"
trap 'echo "Deployment failed. Maintenance remains enabled. Inspect journalctl and use the rollback section of the README." >&2' ERR
sudo -n /usr/bin/systemctl stop "gawdee-frontend@$environment.service"
sudo -n /usr/bin/systemctl stop "gawdee-backend@$environment.service"
gawdee-python /usr/local/lib/gawdee/backup.py "$environment"

# Atomic link switch; database migrations run when the new backend starts.
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
sudo -n /usr/bin/systemctl start "gawdee-backend@$environment.service"
healthy=false
for attempt in $(seq 1 30); do
  if curl --fail --silent --max-time 5 "http://127.0.0.1:$api_port/api/health" >/dev/null; then
    healthy=true; break
  fi
  sleep 2
done
[[ "$healthy" == true ]]
curl --fail --silent --show-error --max-time 30 "http://127.0.0.1:$api_port/api/catalog/categories" >/dev/null
sudo -n /usr/bin/systemctl start "gawdee-frontend@$environment.service"
healthy=false
for attempt in $(seq 1 30); do
  version=$(curl --fail --silent --max-time 5 "http://127.0.0.1:$frontend_port/deploy-version.txt" || true)
  if [[ "$version" == "$sha" ]]; then healthy=true; break; fi
  sleep 2
done
[[ "$healthy" == true ]]
curl --fail --silent --show-error --max-time 60 "http://127.0.0.1:$frontend_port/" >/dev/null
curl --fail --silent --show-error --max-time 30 "http://127.0.0.1:$frontend_port/api/health" >/dev/null
rm "$base/shared/maintenance"
trap - ERR
printf 'Deployed %s to %s. Previous release: %s\n' "$sha" "$environment" "$previous"
