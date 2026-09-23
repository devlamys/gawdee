#!/usr/bin/env bash
# Code-only rollback. Does not rewind the database or restore deleted orders.
set -Eeuo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin
environment=${1:?Usage: rollback.sh ENV RELEASE_DIRECTORY --schema-compatible}
release_name=${2:?Missing release directory name}
[[ ${3:-} == --schema-compatible ]] || { echo 'Review database compatibility first'; exit 2; }
case "$environment" in
  staging) api_port=8002; frontend_port=3001 ;;
  production) api_port=8001; frontend_port=3000 ;;
  *) exit 2 ;;
esac
[[ $(id -un) == "gawdee-$environment" ]]
[[ "$release_name" =~ ^[0-9a-f]{40}-[0-9]{8}T[0-9]{6}-[0-9]+$ ]]
base="/srv/gawdee/$environment"
release="$base/releases/$release_name"
test -x "$release/backend/.venv/bin/uvicorn"
test -f "$release/frontend/.next/BUILD_ID"
exec 9>"$base/shared/operations.lock"
flock -w 1800 9
touch "$base/shared/maintenance"
sudo -n /usr/bin/systemctl stop "gawdee-frontend@$environment.service"
sudo -n /usr/bin/systemctl stop "gawdee-backend@$environment.service"
gawdee-python /usr/local/lib/gawdee/backup.py "$environment"
ln -s "$release" "$base/current.rollback"
mv -Tf "$base/current.rollback" "$base/current"
sudo -n /usr/bin/systemctl start "gawdee-backend@$environment.service"
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 --max-time 10 "http://127.0.0.1:$api_port/api/health"
sudo -n /usr/bin/systemctl start "gawdee-frontend@$environment.service"
expected=$(cat "$release/frontend/public/deploy-version.txt")
actual=$(curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 2 --max-time 10 "http://127.0.0.1:$frontend_port/deploy-version.txt")
[[ "$expected" == "$actual" ]]
curl --fail --silent --show-error --max-time 60 "http://127.0.0.1:$frontend_port/" >/dev/null
rm "$base/shared/maintenance"
echo "Restored application release $release_name; database was not rewound."
