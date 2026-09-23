#!/usr/bin/env bash
# Run from the repository root after checking out the commit to deploy.
set -euo pipefail
destination=${1:?Usage: package.sh /absolute/path/release.tar.gz}
[[ "$destination" = /* ]] || { echo 'Use an absolute output path'; exit 2; }
python3 docs/deployment/scripts/check-tracked.py
tar --exclude='node_modules' --exclude='.next' --exclude='.venv' \
  --exclude='__pycache__' --exclude='.env*' --exclude='*.sqlite*' \
  --exclude='*.db' --exclude='*.log' --exclude='backend/storage' \
  --exclude='frontend/public/assets/uploads' \
  -czf "$destination" backend frontend
