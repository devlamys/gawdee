"""Create complete test-only config; refuse to overwrite an existing .env."""
import base64
import os
from pathlib import Path
import secrets
import tempfile

root = Path(__file__).resolve().parents[3]
target = root / "backend/.env"
template = (root / "docs/deployment/templates/backend.env.example").read_text()
scratch = Path(tempfile.mkdtemp(prefix="gawdee-ci-", dir=os.environ.get("RUNNER_TEMP")))
overrides = {
    "ENVIRONMENT": "test",
    "GAWDEE_APP_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
    "GAWDEE_STORAGE": str(scratch / "storage"),
    "GAWDEE_PUBLIC_DIR": str(scratch / "public"),
    "CORS_ORIGINS": "http://testserver",
    "SESSION_COOKIE_SECURE": "false",
    "ADMIN_COOKIE_SECURE": "false",
}
lines = []
for line in template.splitlines():
    key = line.split("=", 1)[0]
    lines.append(f"{key}={overrides[key]}" if key in overrides else line)
with target.open("x") as output:
    output.write("\n".join(lines) + "\n")
target.chmod(0o600)
print("Created isolated test configuration; no real integration credentials are used.")
