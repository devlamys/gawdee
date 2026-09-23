"""Run as the environment user, under the environment's operations.lock."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import os
from pathlib import Path
import pwd
import shutil
import sqlite3
import tarfile
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("environment", choices=("staging", "production"))
args = parser.parse_args()
if pwd.getpwuid(os.getuid()).pw_name != f"gawdee-{args.environment}":
    raise SystemExit("Run as the matching environment user.")
os.umask(0o077)
base = Path("/srv/gawdee") / args.environment
shared = base / "shared"
stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
target = shared / "backups" / f"{stamp}-{uuid.uuid4().hex[:8]}"
target.mkdir(parents=True, mode=0o700)
database = shared / "storage/gawdee.sqlite"
if database.exists():
    with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as source:
        with closing(sqlite3.connect(target / "gawdee.sqlite")) as destination:
            source.backup(destination)
            result = destination.execute("PRAGMA integrity_check").fetchone()[0]
            if result != "ok":
                raise RuntimeError(f"Backup integrity check failed: {result}")
for name in ("backend.env", "frontend.env", "runtime.env"):
    shutil.copy2(shared / name, target / name)
with tarfile.open(target / "uploads.tar.gz", "w:gz") as archive:
    archive.add(shared / "public/assets/uploads", arcname="uploads")
current = base / "current"
(target / "release.txt").write_text(str(current.resolve()) if current.exists() else "first-deploy")
(target / "COMPLETE").write_text("Backup finished successfully.\n")
print(target)
