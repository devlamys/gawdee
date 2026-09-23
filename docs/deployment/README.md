# Gawdee: GitHub Actions deployment without Jenkins or Docker

This is a runnable guide for **Ubuntu 24.04 LTS, x86-64**, on one VPS with a public IPv4 address. It runs the Next.js storefront and FastAPI backend directly with systemd, behind Nginx and HTTPS. Staging and production have separate Linux users, databases, uploads, configuration, and ports. For stronger resource isolation, repeat the setup on two VPSs instead.

The files in this directory are **templates only**. They do not deploy anything until you follow this guide and copy the workflows into `.github/workflows/`.

Commands labelled **LOCAL** run in a Bash terminal on your computer, from the repository root unless stated otherwise. Commands labelled **SERVER ROOT** run on the VPS after `sudo -i`. Do not run server setup on your development computer. Replace the example values before running commands. Keep the server root session open so its variables remain available.

| Environment | Example hostname | Frontend | Backend | Razorpay |
|---|---|---:|---:|---|
| Local | localhost | 3000 | 8001 | Test |
| Staging | staging.example.com | 3001 | 8002 | Test |
| Production | example.com | 3000 | 8001 | Live |

```text
feature branch → PR → staging → CI → automatic staging deployment
staging → PR → main → CI → manually test main on staging → manual production deployment

Browser → HTTPS Nginx → Next.js → /api rewrite → FastAPI → SQLite
                      ↘ /assets/uploads/ → persistent files
```

Deployment builds a fresh release while the existing release serves traffic. It then enables maintenance, stops the services, backs up data, switches the release, and starts the services. **This design has a brief maintenance window; it is not zero-downtime deployment.** A failure after stopping the services leaves maintenance enabled for inspection. It does not automatically rewind the database.

## 1. Prepare the repository before enabling automation — LOCAL

Create a working branch, checking your existing changes first:

```bash
git status --short
git switch -c setup/github-deployment
```

### Stop tracking runtime data

At the time this guide was written, `backend/storage/gawdee.sqlite` was tracked by Git. `.gitignore` does not untrack an existing file. The following preserves your local files while removing them from the next commit:

```bash
git rm --cached --ignore-unmatch backend/storage/gawdee.sqlite
git rm --cached --ignore-unmatch backend/.env frontend/.env.local
cat >> .gitignore <<'EOF'

# Deployment/runtime files
backend/storage/
.env.*
!.env.example
*.sqlite3
*.db
*.pem
EOF
python3 docs/deployment/scripts/check-tracked.py
```

If the check lists additional tracked runtime files, use `git rm --cached -- PATH` for those files too. Do not delete the working copies. This removes files from future snapshots, not past Git history. If real credentials were committed, rotate them; deleting a file in a later commit does not make its earlier content secret again.

Leave existing uploaded artwork tracked for now if the application needs it. The release packaging script excludes `frontend/public/assets/uploads/`; you will seed persistent uploads separately in step 9. Future admin uploads should live only on the server and in backups.

### Create the missing backend example and lock dependencies

The backend requires every field in `app/core/config.py`. Its previous README referenced a missing example. The supplied template includes all current fields and no real credentials:

```bash
cp docs/deployment/templates/backend.env.example backend/.env.example
```

Use your existing, tested Python 3.14.4 backend virtual environment to record exact installed versions. This includes the test dependencies already used by this project:

```bash
backend/.venv/bin/python --version
backend/.venv/bin/python -m pip freeze > backend/requirements.lock.txt
```

Inspect `requirements.lock.txt` before committing: it must contain installable pinned packages, with no private URL credentials, editable local projects, or `file://` paths. When updating dependencies later, update and test this lockfile too. CI and deployment both install this file. Keep `frontend/package-lock.json` committed; frontend installs use `npm ci`.

### Make storefront data resolve at runtime

The homepage and root layout fetch backend data. CI intentionally has no real backend, and the first server build may happen before the API exists. To avoid baking fallback store settings or empty products into static pages, add this at module level in `frontend/src/app/layout.tsx`, after its imports:

```tsx
export const dynamic = 'force-dynamic';
```

This selects request-time rendering for the current deployment design. It trades static page caching for correctness; selective caching can be introduced later. The supplied CI uses an unreachable loopback API URL and never connects to the production backend. Next.js supports this route setting when `cacheComponents` is not enabled, as in the current project. [Route segment configuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)

Review and commit only the intended files; do not use an indiscriminate `git add .`:

```bash
git add .gitignore docs/deployment backend/.env.example backend/requirements.lock.txt frontend/src/app/layout.tsx
git diff --cached --stat
git commit -m "Add staging and production deployment guide and templates"
git push -u origin setup/github-deployment
```

Merge this branch through your normal review process. Create a `staging` branch from the updated `main` if it does not exist. Later steps require these files on both branches.

## 2. Provision DNS and prepare Ubuntu — SERVER ROOT

This guide does not require a particular VPS provider. Builds need enough spare RAM and disk alongside both running environments; increase server resources if builds are killed for memory exhaustion. Use an SSH key for your administrative account and retain console access from your provider.

Point DNS A records for `example.com` and `staging.example.com` to the VPS. If using Cloudflare, keep them **DNS only** during initial certificate setup and administrator registration. Remove stale AAAA records unless IPv6 is configured on this VPS. Use your VPS IP for SSH, not a Cloudflare-proxied hostname.

Connect as your administrative user, then enter a root shell:

```bash
ssh YOUR_ADMIN_USER@YOUR_VPS_IP
sudo -i
```

Set these variables in that root session:

```bash
prod_domain='example.com'
stage_domain='staging.example.com'
admin_ip='YOUR_COMPUTER_PUBLIC_IPV4'
cert_email='you@example.com'
```

Install system tools and permit SSH before enabling the firewall. These commands assume standard SSH port 22; preserve your custom SSH rule first if you use another port:

```bash
apt-get update
apt-get install -y nginx certbot python3-certbot-nginx python3 python3-venv \
  git rsync curl ca-certificates xz-utils sqlite3 acl ufw build-essential
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
systemctl enable --now nginx
```

Mirror these inbound rules in the VPS provider's firewall. Ports 3000, 3001, 8001, and 8002 stay bound to loopback and need no public firewall rules.

### Install Node.js 24.21.0

This matches the current development runtime. Use the official Linux x64 archive, verify its checksum, and install it under `/opt`:

```bash
node_version='24.21.0'
install -d /opt /tmp/gawdee-node-install
cd /tmp/gawdee-node-install
curl -fSLO "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz"
curl -fSLO "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
grep " node-v${node_version}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum --check -
tar -xJf "node-v${node_version}-linux-x64.tar.xz" -C /opt
ln -sfn "/opt/node-v${node_version}-linux-x64" /opt/gawdee-node
ln -sfn /opt/gawdee-node/bin/node /usr/local/bin/node
ln -sfn /opt/gawdee-node/bin/npm /usr/local/bin/npm
ln -sfn /opt/gawdee-node/bin/npx /usr/local/bin/npx
/usr/local/bin/node --version
/usr/local/bin/npm --version
```

For ARM servers, use the corresponding official `linux-arm64` archive instead. Keep the CI Node version and server runtime aligned when upgrading. [Official Node.js downloads](https://nodejs.org/en/download)

### Install Python 3.14.4 without replacing Ubuntu's Python

Ubuntu's own Python remains intact. Install `uv` in a dedicated tools environment, then install an isolated Python distribution:

```bash
python3 -m venv /opt/gawdee-tools
/opt/gawdee-tools/bin/python -m pip install uv
UV_PYTHON_INSTALL_DIR=/opt/gawdee-python /opt/gawdee-tools/bin/uv python install 3.14.4
python_path=$(UV_PYTHON_INSTALL_DIR=/opt/gawdee-python /opt/gawdee-tools/bin/uv python find --managed-python 3.14.4)
ln -sfn "$python_path" /usr/local/bin/gawdee-python
/usr/local/bin/gawdee-python --version
```

`uv` supplies managed Python builds; it does not replace `/usr/bin/python3`. [Managed Python documentation](https://docs.astral.sh/uv/concepts/python-versions/)

## 3. Create isolated users and persistent folders — SERVER ROOT

```bash
install -d -m 755 /srv/gawdee
for environment in staging production; do
  user="gawdee-$environment"
  base="/srv/gawdee/$environment"
  id "$user" >/dev/null 2>&1 || adduser --disabled-password --gecos '' "$user"
  install -d -o "$user" -g "$user" -m 751 "$base" "$base/shared"
  install -d -o "$user" -g "$user" -m 750 "$base/releases" "$base/incoming"
  install -d -o "$user" -g "$user" -m 700 "$base/shared/storage" "$base/shared/backups"
  install -d -o "$user" -g www-data -m 2750 \
    "$base/shared/public" "$base/shared/public/assets" "$base/shared/public/assets/uploads"
  install -d -o "$user" -g "$user" -m 700 "/home/$user/.ssh"
done
```

The upload folders use the `www-data` group and setgid bit so new upload files inherit a group Nginx can read. Database directories and backup directories are private to their environment user.

```text
/srv/gawdee/production/
  incoming/                       # Source archives received over SSH
  releases/<sha>-<timestamp>-<id>/ # Code, venv, node_modules, .next
  current -> releases/<active>/
  shared/
    backend.env                   # Mode 600; never in release archives
    frontend.env
    runtime.env
    storage/gawdee.sqlite
    public/assets/uploads/
    backups/<timestamp>/
    operations.lock
```

## 4. Copy the deployment toolkit to the server

**LOCAL**, from the repository root:

```bash
rsync -av docs/deployment/ YOUR_ADMIN_USER@YOUR_VPS_IP:/tmp/gawdee-deployment/
```

**SERVER ROOT**:

```bash
install -d -m 755 /usr/local/lib/gawdee
install -o root -g root -m 755 /tmp/gawdee-deployment/scripts/deploy.sh /usr/local/lib/gawdee/deploy.sh
install -o root -g root -m 755 /tmp/gawdee-deployment/scripts/rollback.sh /usr/local/lib/gawdee/rollback.sh
install -o root -g root -m 644 /tmp/gawdee-deployment/scripts/backup.py /usr/local/lib/gawdee/backup.py
install -o root -g root -m 644 /tmp/gawdee-deployment/templates/gawdee-*.service /etc/systemd/system/
install -o root -g root -m 644 /tmp/gawdee-deployment/templates/gawdee-backup@.timer /etc/systemd/system/
```

Root owns the service definitions and deployment tools. GitHub uploads application code as the environment user; it does not replace these administrative files. Repeat this installation step when you intentionally update the toolkit.

## 5. Create environment configuration — SERVER ROOT

The next command creates **new** configurations. It refuses to overwrite existing files. It generates different encryption keys for staging and production and never prints them:

```bash
STAGE_DOMAIN="$stage_domain" PROD_DOMAIN="$prod_domain" /usr/local/bin/gawdee-python - <<'PY'
import base64, os, pwd, secrets
from pathlib import Path

template = Path('/tmp/gawdee-deployment/templates/backend.env.example').read_text()
for environment, api_port, front_port, domain in (
    ('staging', 8002, 3001, os.environ['STAGE_DOMAIN']),
    ('production', 8001, 3000, os.environ['PROD_DOMAIN']),
):
    base = Path('/srv/gawdee') / environment / 'shared'
    user = pwd.getpwnam(f'gawdee-{environment}')
    changes = {
        'ENVIRONMENT': environment,
        'GAWDEE_STORAGE': str(base / 'storage'),
        'GAWDEE_PUBLIC_DIR': str(base / 'public'),
        'GAWDEE_APP_KEY': base64.b64encode(secrets.token_bytes(32)).decode(),
        'CORS_ORIGINS': f'https://{domain}',
    }
    backend = '\n'.join(
        f'{line.split("=", 1)[0]}={changes[line.split("=", 1)[0]]}'
        if line.split('=', 1)[0] in changes else line
        for line in template.splitlines()
    ) + '\n'
    frontend = (
        f'BACKEND_ORIGIN=http://127.0.0.1:{api_port}\n'
        f'INTERNAL_API_URL=http://127.0.0.1:{api_port}/api\n'
        'NEXT_PUBLIC_API_URL=/api\n'
        'NODE_ENV=production\n'
    )
    runtime = f'API_PORT={api_port}\nFRONTEND_PORT={front_port}\n'
    for name, content in [('backend.env', backend), ('frontend.env', frontend), ('runtime.env', runtime)]:
        path = base / name
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            output.write(content)
        os.chown(path, user.pw_uid, user.pw_gid)
print('Created separate environment files. No secrets printed.')
PY
```

Review business limits and endpoint settings against your existing configuration using `sudoedit` or your server editor. These are a complete starting baseline, not a copy of your local business configuration. Do not regenerate `GAWDEE_APP_KEY` on deployment: existing encrypted settings require the same key.

If importing the current store database, put its **existing** `GAWDEE_APP_KEY` in production's `backend.env` before starting the backend. A freshly generated key cannot decrypt data encrypted with the old key. Staging should use a separate database, key, and test integrations.

Next.js reads backend rewrites during the build. A change to `BACKEND_ORIGIN` or browser configuration needs a rebuild/deployment, not only a service restart.

## 6. Allow narrowly scoped service control — SERVER ROOT

The deployment users need to stop and start their own two units. They do not need unrestricted sudo:

```bash
for environment in staging production; do
  user="gawdee-$environment"
  cat > "/etc/sudoers.d/gawdee-$environment" <<EOF
$user ALL=(root) NOPASSWD: /usr/bin/systemctl start gawdee-backend@$environment.service, /usr/bin/systemctl stop gawdee-backend@$environment.service, /usr/bin/systemctl start gawdee-frontend@$environment.service, /usr/bin/systemctl stop gawdee-frontend@$environment.service
EOF
  chmod 440 "/etc/sudoers.d/gawdee-$environment"
  visudo -cf "/etc/sudoers.d/gawdee-$environment"
done
systemctl daemon-reload
systemctl enable gawdee-backend@staging gawdee-frontend@staging
systemctl enable gawdee-backend@production gawdee-frontend@production
```

Do not start the app units yet: there is no `current` release. One Uvicorn worker is used per environment; this backend starts its loyalty maintenance loop during application startup. [Uvicorn settings](https://www.uvicorn.org/settings/)

## 7. Configure Nginx and HTTPS — SERVER ROOT

Render the provided Nginx template for both environments:

```bash
install -d -m 755 /var/www/letsencrypt
for environment in staging production; do
  if [ "$environment" = staging ]; then
    domain="$stage_domain"; frontend_port=3001
  else
    domain="$prod_domain"; frontend_port=3000
  fi
  sed -e "s/__DOMAIN__/$domain/g" -e "s/__ENV__/$environment/g" \
      -e "s/__FRONTEND_PORT__/$frontend_port/g" -e "s/__ADMIN_IP__/$admin_ip/g" \
      /tmp/gawdee-deployment/templates/nginx.conf > "/etc/nginx/sites-available/gawdee-$environment"
  ln -sfn "/etc/nginx/sites-available/gawdee-$environment" "/etc/nginx/sites-enabled/gawdee-$environment"
done
nginx -t
systemctl reload nginx
certbot --nginx --redirect -d "$stage_domain" -d "$prod_domain" --email "$cert_email" --agree-tos --no-eff-email
certbot renew --dry-run
```

Only your public IP can initially reach the application. This lets you create the first administrator before opening access to everyone. ACME certificate challenges remain public. A 502 before the first application deployment is expected; Nginx has no app process to contact yet.

Next.js forwards `/api/*` to its backend; Nginx keeps the original HTTPS scheme in the proxy headers. Uploaded media is served directly from shared storage. Dynamic HTML and API responses are not given a blanket CDN cache rule. [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting)

## 8. Set up deployment SSH keys — LOCAL, then SERVER ROOT

Create two dedicated keys on your computer, outside the repository:

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/gawdee-staging-deploy" -C 'github-gawdee-staging' -N ''
ssh-keygen -t ed25519 -f "$HOME/.ssh/gawdee-production-deploy" -C 'github-gawdee-production' -N ''
scp "$HOME/.ssh/gawdee-staging-deploy.pub" YOUR_ADMIN_USER@YOUR_VPS_IP:/tmp/gawdee-staging-deploy.pub
scp "$HOME/.ssh/gawdee-production-deploy.pub" YOUR_ADMIN_USER@YOUR_VPS_IP:/tmp/gawdee-production-deploy.pub
```

Install their **public** keys, **SERVER ROOT**:

```bash
for environment in staging production; do
  user="gawdee-$environment"
  key=$(cat "/tmp/gawdee-$environment-deploy.pub")
  printf 'restrict %s\n' "$key" >> "/home/$user/.ssh/authorized_keys"
  chown "$user:$user" "/home/$user/.ssh/authorized_keys"
  chmod 600 "/home/$user/.ssh/authorized_keys"
done
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Record the server fingerprint through this existing trusted session or the provider console. **LOCAL**, collect the corresponding known-hosts line and compare its fingerprint before trusting it:

```bash
ssh-keyscan -t ed25519 YOUR_VPS_IP > /tmp/gawdee-known-hosts
ssh-keygen -lf /tmp/gawdee-known-hosts
```

The two fingerprints must match. Do not disable `StrictHostKeyChecking`. Test access using the verified file:

```bash
ssh -i "$HOME/.ssh/gawdee-staging-deploy" -o UserKnownHostsFile=/tmp/gawdee-known-hosts \
  -o StrictHostKeyChecking=yes gawdee-staging@YOUR_VPS_IP 'id -un'
```

Expect `gawdee-staging`. The `restrict` key option disables forwarding and PTY features; ordinary SSH commands and file uploads still work.

## 9. Seed uploads and optionally import the current store — LOCAL

Do this before the first deployment and before anyone is placing orders on the new server.

Seed staging and production independently from the existing uploads. `--ignore-existing` avoids overwriting server files if you repeat the command; no `--delete` is used:

```bash
rsync -av --ignore-existing --no-owner --no-group --chmod=D2750,F640 \
  -e "ssh -i $HOME/.ssh/gawdee-staging-deploy -o UserKnownHostsFile=/tmp/gawdee-known-hosts -o StrictHostKeyChecking=yes" \
  frontend/public/assets/uploads/ gawdee-staging@YOUR_VPS_IP:/srv/gawdee/staging/shared/public/assets/uploads/
rsync -av --ignore-existing --no-owner --no-group --chmod=D2750,F640 \
  -e "ssh -i $HOME/.ssh/gawdee-production-deploy -o UserKnownHostsFile=/tmp/gawdee-known-hosts -o StrictHostKeyChecking=yes" \
  frontend/public/assets/uploads/ gawdee-production@YOUR_VPS_IP:/srv/gawdee/production/shared/public/assets/uploads/
```

If you want a **new empty store**, skip database import and create products through the admin UI. Staging should use test data, so it does not inherit live payment keys or customer notifications from production.

If you want to **move the existing store to production**, stop local order intake and the local backend before the final snapshot. Create a consistent SQLite backup, then upload it:

```bash
python3 - <<'PY'
from contextlib import closing
from pathlib import Path
import sqlite3
destination = Path('/tmp/gawdee-production-import.sqlite')
if destination.exists():
    raise SystemExit('Import snapshot already exists; choose a new filename.')
with closing(sqlite3.connect('file:backend/storage/gawdee.sqlite?mode=ro', uri=True)) as source:
    with closing(sqlite3.connect(destination)) as target:
        source.backup(target)
        assert target.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
destination.chmod(0o600)
PY
scp -i "$HOME/.ssh/gawdee-production-deploy" -o UserKnownHostsFile=/tmp/gawdee-known-hosts \
  /tmp/gawdee-production-import.sqlite gawdee-production@YOUR_VPS_IP:/srv/gawdee/production/incoming/import.sqlite
```

**SERVER ROOT**, only for a first import into an empty environment:

```bash
test ! -e /srv/gawdee/production/shared/storage/gawdee.sqlite
install -o gawdee-production -g gawdee-production -m 600 \
  /srv/gawdee/production/incoming/import.sqlite /srv/gawdee/production/shared/storage/gawdee.sqlite
rm /srv/gawdee/production/incoming/import.sqlite
```

Set the original encryption key in production's `backend.env` as described in step 5. Take a final upload sync after stopping the old backend as well. Keep the old system from accepting new orders after cutover, or the two databases will diverge.

## 10. Make the first deployment manually — LOCAL

Finish and commit the repository preparation before packaging. Package from a clean checkout so the commit SHA accurately identifies the deployed code:

```bash
git status --short
git switch staging
git pull --ff-only origin staging
git diff --exit-code
git diff --cached --exit-code
release_sha=$(git rev-parse HEAD)
bash docs/deployment/scripts/package.sh "/tmp/$release_sha.tar.gz"
scp -i "$HOME/.ssh/gawdee-staging-deploy" -o UserKnownHostsFile=/tmp/gawdee-known-hosts \
  "/tmp/$release_sha.tar.gz" "gawdee-staging@YOUR_VPS_IP:/srv/gawdee/staging/incoming/$release_sha.tar.gz"
ssh -i "$HOME/.ssh/gawdee-staging-deploy" -o UserKnownHostsFile=/tmp/gawdee-known-hosts \
  gawdee-staging@YOUR_VPS_IP "/usr/local/lib/gawdee/deploy.sh staging $release_sha"
```

The script installs backend dependencies in a release-specific venv, builds Next.js, stops the old services, backs up data, switches `current`, runs startup migrations, and checks API health, the catalog, homepage, and release marker. It preserves all shared data.

Open `https://staging.example.com/admin/login` from the allowed IP. Create the first administrator if the database is empty. Complete a test product and checkout setup. If registration reports an existing customer email, choose a different administrator email.

For the first production deployment, use a reviewed `main` checkout and repeat the same commands with `production` and the production SSH key. Set up the administrator before opening public access. Imported databases may already have an administrator.

Once admin setup is complete, **SERVER ROOT**, open the sites to visitors and GitHub's public health checks:

```bash
for environment in staging production; do
  sed -i -e '/^[[:space:]]*allow .*;$/d' -e '/^[[:space:]]*deny all;$/d' \
    "/etc/nginx/sites-available/gawdee-$environment"
done
nginx -t
systemctl reload nginx
```

This removes the initial IP restriction, including the redundant `allow all` inside ACME. If only staging is ready, run the command for staging only; leave production restricted until its administrator is set up.

If using Cloudflare, you may now enable proxying with **Full (strict)** TLS. Keep HTTPS on the VPS, and do not use a temporary `trycloudflare.com` address for production checkout. If staging contains non-test information, add an access-control layer deliberately and adapt the public health checks and webhook access to it.

## 11. Configure GitHub environments and secrets

In **Repository → Settings → Environments**, create `staging` and `production` if your GitHub plan supports them. Allow `staging` and `main` for staging deployments; allow only `main` for production. Enable production required reviewers where available.

Private repository environments require an eligible paid plan, and required-reviewer availability has further restrictions. If using a private repository on GitHub Free, remove the marked `environment:` line from `templates/deploy.yml` and use repository secrets instead. The branch checks and manual production trigger still work, but are **not** an independent reviewer approval gate. [GitHub plan and environment rules](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

Add the following under each environment's **Secrets**. For the GitHub Free fallback, add all six under **Settings → Secrets and variables → Actions → Repository secrets**:

| Secret | Value |
|---|---|
| `STAGING_SSH_HOST` | VPS public IPv4 address |
| `STAGING_SSH_KEY` | Entire staging private key file, including BEGIN/END lines |
| `STAGING_SSH_KNOWN_HOSTS` | Verified contents of `/tmp/gawdee-known-hosts` |
| `PRODUCTION_SSH_HOST` | Production VPS IPv4 address |
| `PRODUCTION_SSH_KEY` | Entire production private key file |
| `PRODUCTION_SSH_KNOWN_HOSTS` | Verified production known-hosts entry |

Add these **Variables**, at repository level or in their respective environments:

```text
STAGING_SITE_URL=https://staging.example.com
PRODUCTION_SITE_URL=https://example.com
```

Do not put a trailing slash in the site URLs. Backend secrets remain on the VPS; CI gets no payment credentials. Anyone permitted to deploy arbitrary application code can access that environment's runtime credentials, so control repository write access and workflow changes accordingly.

## 12. Enable the supplied GitHub Actions workflows — LOCAL

```bash
mkdir -p .github/workflows
cp docs/deployment/templates/ci.yml .github/workflows/ci.yml
cp docs/deployment/templates/deploy.yml .github/workflows/deploy.yml
git add .github/workflows/ci.yml .github/workflows/deploy.yml
git commit -m "Enable GitHub Actions CI and staged deployment"
git push
```

Merge the workflows into `main` and `staging`. `workflow_dispatch` must exist on the default branch to be available in the GitHub Actions UI. These workflows use GitHub-hosted Ubuntu runners and JavaScript actions; they do not use a Docker service or a container action. Versions are taken from the official [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node), and [setup-python](https://github.com/actions/setup-python) repositories. You can pin reviewed action revisions to full commit SHAs for stricter supply-chain reproducibility.

CI runs the explicit admin, loyalty, and payment regression suites. Do not run every `backend/test_*.py` indiscriminately: some existing scripts are manual API/automation exercises, not isolated CI tests. It generates a temporary backend configuration with a random test key, then runs frontend typechecking, lint, and a production build.

**Existing lint/build failures are deployment blockers.** Fix them and rerun CI; the guide does not suppress failures with `continue-on-error`. This documentation task did not certify the entire existing application as production-build clean.

The deployment job only runs after CI succeeds. `concurrency` and a server-side `flock` serialize deployments and backups per environment. Builds happen on the server too, with that environment's frontend configuration. The same dependency locks and source commit are used, but this is not a build-once artifact-promotion pipeline. [Workflow concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)

## 13. Your daily release process

1. Create a feature branch from updated `staging`.
2. Open a pull request into `staging`; inspect CI and review the change.
3. Merge it. The Deploy workflow runs CI and automatically updates staging.
4. Test storefront images, product edits, uploads, login, cart, checkout, and order confirmation.
5. Open and merge a pull request from `staging` to `main` after review.
6. To test the final merged commit, open **Actions → Deploy → Run workflow**, select branch `main`, and target `staging`. Verify that release before promotion.
7. Open **Actions → Deploy → Run workflow**, select `main` and target `production`. It runs CI again and waits for environment approval if configured.
8. Confirm the run's SHA is the same `main` commit you tested. If `main` advanced, test the new commit on staging first. This human promotion check is not automatically enforced by the template.
9. Confirm the public health endpoint and release marker after deployment.

```bash
curl --fail https://staging.example.com/api/health
curl --fail https://staging.example.com/deploy-version.txt
curl --fail https://example.com/api/health
curl --fail https://example.com/deploy-version.txt
```

Protect `main` and `staging` with required CI checks and reviewed pull requests where your plan supports it. For `main`, require the `checks` job from CI. Restrict who can run production deployments. Never use `pull_request_target` to execute untrusted PR code with deployment secrets.

## 14. Payment, shipping, and notification configuration

Integration credentials are stored in this app's SQLite settings table, not simply in the environment files. Configure them through **Admin → Integrations** after deploying each environment. Staging must use Razorpay Test credentials and test recipients. Keep real WhatsApp/SMS/email credentials and automated fulfillment disabled there unless deliberately testing with controlled recipients.

Production needs a matching Live Key ID/Key Secret and a website registered with Razorpay. The previous tunnel failure was a registered-website mismatch; deploying the code alone does not approve a website. [Razorpay business website setup](https://razorpay.com/docs/payments/dashboard/account-settings/business-website-details/)

Use these webhook URLs in the corresponding Razorpay mode:

```text
Staging:    https://staging.example.com/api/webhooks/razorpay
Production: https://example.com/api/webhooks/razorpay
Events:     payment.captured, order.paid, payment.failed
```

Set a separate webhook secret per environment in the app's `razorpay_webhook_secret` setting and in Razorpay. If your current admin form has no webhook-secret field, set it on the server using the application's settings function. **SERVER ROOT**, this prompts without displaying the secret:

```bash
sudo -u gawdee-production bash -c 'cd /srv/gawdee/production/current/backend && .venv/bin/python -' <<'PY'
import asyncio, getpass
from app.database import get_db, set_setting

async def main():
    secret = getpass.getpass('Razorpay production webhook secret: ')
    if not secret:
        raise SystemExit('Secret cannot be empty')
    db = await get_db()
    try:
        # The current admin settings editor round-trips raw values. Preserve its
        # existing storage convention until encrypted-settings editing is fixed.
        await set_setting(db, 'razorpay_webhook_secret', secret, secret=False)
    finally:
        await db.close()
    print('Webhook secret saved; configure the identical value in Razorpay.')
asyncio.run(main())
PY
```

Use `gawdee-staging` and the staging path for test mode. Protect database backups as secrets too. Razorpay signature verification must remain enabled. Use the gateway's test webhook tools to verify deliveries and check integration logs; do not manufacture paid orders or perform live charges from CI.

## 15. Backups and off-server copies — SERVER ROOT

Each deployment backs up after stopping the application, so the database and uploads are captured while app writes are stopped. Daily backups use SQLite's online backup API; the database snapshot is consistent, but uploads can change during an online file backup. The `COMPLETE` marker is written only after the backup finishes.

```bash
systemctl enable --now gawdee-backup@staging.timer gawdee-backup@production.timer
systemctl start gawdee-backup@production.service
systemctl list-timers 'gawdee-backup@*'
ls -lt /srv/gawdee/production/shared/backups
```

Backups include the database, uploaded images, environment files, encryption key, and active release path. They have restricted permissions and are not publicly served. Copy them off the VPS. For example, from a trusted backup computer using your private deployment key:

```bash
mkdir -p "$HOME/gawdee-private-backups/production"
chmod 700 "$HOME/gawdee-private-backups" "$HOME/gawdee-private-backups/production"
rsync -a --chmod=D700,F600 \
  -e "ssh -i $HOME/.ssh/gawdee-production-deploy -o UserKnownHostsFile=/tmp/gawdee-known-hosts -o StrictHostKeyChecking=yes" \
  gawdee-production@YOUR_VPS_IP:/srv/gawdee/production/shared/backups/ \
  "$HOME/gawdee-private-backups/production/"
```

Retain multiple completed backups and verify restoration before relying on them. This toolkit does not automatically prune backups or releases; monitor disk usage and archive older completed backups before removing them. Never prune the active release or the release referenced by the recovery snapshot you intend to use.

## 16. Diagnose deployment failures — SERVER ROOT

```bash
systemctl status gawdee-backend@production gawdee-frontend@production --no-pager
journalctl -u gawdee-backend@production -n 100 --no-pager
journalctl -u gawdee-frontend@production -n 100 --no-pager
journalctl -u gawdee-backup@production -n 100 --no-pager
nginx -t
curl --fail http://127.0.0.1:8001/api/health
curl --fail http://127.0.0.1:3000/api/health
cat /srv/gawdee/production/shared/previous-release.txt
```

| Symptom | Check |
|---|---|
| CI rejects tracked files | Run step 1; `.gitignore` alone does not untrack SQLite |
| Missing backend settings | Complete `shared/backend.env`; do not print it in Actions logs |
| CI/build fails | Fix the reported application error; builds are intentionally required |
| Build is killed | Check VPS memory/disk; avoid simultaneous staging and production builds on small servers |
| SSH host key failure | Verify the new fingerprint out of band before replacing the known-hosts secret |
| Public 403 | Initial admin-IP restriction remains in Nginx, or an access-control layer blocks the runner |
| Public 503 | Deployment maintenance file remains after a failure; inspect logs before removing it |
| Public 502 | App unit failed, wrong port, or `current` release missing |
| Uploaded images 403/404 | Check shared upload paths, permissions, and the Nginx alias |
| Slow images | Source images still need resizing/compression; CI/CD does not optimize them automatically |
| Production calls staging API | Check frontend build environment and rebuild with the correct ports |
| Razorpay website mismatch | Fix Razorpay's approved website; this is not solved by restarting services |
| HTTPS or renewal fails | Check A/AAAA records, DNS-only setup, port 80/443 access, and ACME route |

To retry a failed deployment, correct the cause and rerun it. If an interruption left `current.next` or `current.rollback`, inspect those symlinks and remove only the stale temporary link before retrying. Never delete `current` or the shared directory as a generic troubleshooting step.

## 17. Roll back application code without deleting recent orders

The backend runs migrations at startup. A previous application release is usable only if it understands the current database schema. Review the migration before choosing a rollback.

**SERVER ROOT**, list releases and the previous target:

```bash
ls -lt /srv/gawdee/production/releases
cat /srv/gawdee/production/shared/previous-release.txt
```

Once schema compatibility is confirmed, use the directory basename printed above:

```bash
sudo -u gawdee-production /usr/local/lib/gawdee/rollback.sh production \
  REPLACE_WITH_SHA_TIMESTAMP_DIRECTORY --schema-compatible
```

The rollback script locks the environment, enables maintenance, stops services, creates another backup, switches to the selected release, starts it, checks health and its release marker, and removes maintenance. It **keeps the current database**, preserving orders placed after the old deployment. It refuses a malformed release name and does not install old dependencies again.

If a schema change prevents code-only rollback, prefer a forward fix. Restoring an older database also removes every order and payment update received after that backup. Do not restore it casually on a live store; reconcile subsequent Razorpay payments and orders first.

## 18. Restore a database snapshot during a planned recovery

Use this only after choosing a completed backup and accepting its recovery point. Rehearse on a disposable environment first. The following deliberately stops writes, preserves a fresh recovery backup, and restores only the database; it does not silently replace encryption keys, uploads, or application code.

**SERVER ROOT**:

```bash
touch /srv/gawdee/production/shared/maintenance
systemctl stop gawdee-frontend@production gawdee-backend@production
systemctl stop gawdee-backup@production.timer
sudo -u gawdee-production /usr/bin/flock /srv/gawdee/production/shared/operations.lock \
  /usr/local/bin/gawdee-python /usr/local/lib/gawdee/backup.py production
```

Choose an exact snapshot directory with a `COMPLETE` marker. **SERVER ROOT**, replace the placeholder in this command:

```bash
sudo -u gawdee-production /usr/bin/flock /srv/gawdee/production/shared/operations.lock \
  /usr/local/bin/gawdee-python - REPLACE_WITH_BACKUP_DIRECTORY <<'PY'
from contextlib import closing
from pathlib import Path
import os, shutil, sqlite3, sys
base = Path('/srv/gawdee/production/shared')
snapshot = (base / 'backups' / sys.argv[1]).resolve()
assert snapshot.parent == (base / 'backups').resolve(), 'Choose a direct backup directory'
assert (snapshot / 'COMPLETE').is_file(), 'Backup is incomplete'
source = snapshot / 'gawdee.sqlite'
with closing(sqlite3.connect(f'file:{source}?mode=ro', uri=True)) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
target = base / 'storage/gawdee.sqlite'
temporary = base / 'storage/gawdee.restore.sqlite'
shutil.copy2(source, temporary)
temporary.chmod(0o600)
# Both app services are stopped. Remove stale journals for the replaced DB only.
for suffix in ('-wal', '-shm', '-journal'):
    Path(str(target) + suffix).unlink(missing_ok=True)
os.replace(temporary, target)
print('Database restored. Services remain stopped for review.')
PY
```

Verify the selected snapshot's `backend.env` has the encryption key required by that database. If restoring after key loss, restore that key securely before starting. Recover missing upload files from `uploads.tar.gz` into the shared upload directory, preserving its ownership and Nginx group access. Choose application code compatible with the restored schema; use the code rollback command in step 17 to select it and perform startup health checks. Then restart the backup timer:

```bash
systemctl start gawdee-backup@production.timer
```

If keeping the current code instead, start backend and frontend, run the health checks from step 16, then remove `/srv/gawdee/production/shared/maintenance` only after confirming the store is healthy. Remember that starting the backend can apply migrations again.

## 19. What is supplied and what still requires your setup

All source code for this guide is included below and in the adjacent files. Copying this README does not provision a VPS, approve a Razorpay domain, configure GitHub secrets, or run a production deployment.

| File | Purpose |
|---|---|
| `templates/backend.env.example` | Complete nonsecret backend configuration baseline |
| `templates/ci.yml` | Isolated backend checks, frontend checks, production build |
| `templates/deploy.yml` | Branch checks, SSH upload, deployment, public health checks |
| `templates/gawdee-backend@.service` | FastAPI process management |
| `templates/gawdee-frontend@.service` | Next.js process management |
| `templates/nginx.conf` | Reverse proxy, upload serving, initial admin access restriction |
| `templates/gawdee-backup@.service` / `.timer` | Scheduled backups |
| `scripts/package.sh` | Source packaging that excludes runtime data |
| `scripts/deploy.sh` | Build, backup, release switch, service startup, health checks |
| `scripts/rollback.sh` | Explicit code-only rollback |
| `scripts/backup.py` | SQLite snapshot, uploads and environment backup |
| `scripts/check-tracked.py` | Reject tracked database and environment files |
| `scripts/prepare-ci.py` | Complete temporary test configuration |

Local validation of templates is not an end-to-end test on your VPS. Before accepting live traffic, verify the first deployment, test payments and webhooks, persistence across a second deployment, and a backup restoration.

<!-- FULL_TEMPLATE_SOURCE -->
