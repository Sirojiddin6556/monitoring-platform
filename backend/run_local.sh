#!/usr/bin/env bash
set -euo pipefail
# Run backend locally without Docker (POSIX)
export DATABASE_URL="sqlite+aiosqlite:///./data/monitoring.db"
mkdir -p data

# Activate venv if present
if [ -f ./venv/bin/activate ]; then
  # shellcheck source=/dev/null
  . ./venv/bin/activate
fi

echo "Installing local requirements (aiosqlite)..."
python -m pip install -r backend/requirements-local.txt

echo "Starting backend on http://127.0.0.1:8000"
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
