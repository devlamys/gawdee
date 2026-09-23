"""Refuse to put runtime data or environment secrets in CI/deployment sources."""
from pathlib import PurePosixPath
import subprocess

files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
bad = []
for name in filter(None, files):
    path = PurePosixPath(name)
    if (path.name.startswith(".env") and not path.name.endswith(".example")) or (
        path.suffix in {".sqlite", ".sqlite3", ".db"}
        or path.name.endswith((".sqlite-wal", ".sqlite-shm", ".sqlite-journal"))
        or name.startswith("backend/storage/")
    ):
        bad.append(name)
if bad:
    raise SystemExit("Untrack these runtime files (keep local copies):\n" + "\n".join(bad))
print("No tracked environment secrets or database files found.")
