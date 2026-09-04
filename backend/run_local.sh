#!/usr/bin/env bash
set -euo pipefail

#######################################
# Run backend locally without Docker (POSIX)
# Supports reload mode via BACKEND_RELOAD environment variable
#######################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

write_header() {
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║ $1" | head -c 54 | xargs printf "║ %-54s ║\n"
  echo "╚════════════════════════════════════════════════════════╝"
}

write_success() {
  echo "✓ $1"
}

write_error() {
  echo "✗ $1" >&2
}

write_info() {
  echo "ℹ $1"
}

cd "$PROJECT_ROOT"

trap 'write_error "Script interrupted"; exit 1' INT TERM

write_header "Backend Local Runner"

# Check venv
write_info "Checking virtual environment..."
if [ ! -f "venv/bin/activate" ]; then
  write_error "venv not found at venv/bin/activate"
  echo "Create it with: python -m venv venv" >&2
  exit 1
fi

# Activate venv
# shellcheck source=/dev/null
. venv/bin/activate
write_success "Virtual environment activated"

# Set environment variables
write_info "Setting environment variables..."
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./data/monitoring.db}"
export DEV_ALLOW_INSECURE_SECRET="1"
export ENVIRONMENT="local"
export SECRET_KEY="${SECRET_KEY:-dev-secret-key-change-me}"
export INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-admin@example.com}"
export INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-admin123}"
export INGEST_API_KEY="${INGEST_API_KEY:-5aaOHADSpi7ER87pvC4U8oeQaYEhGhbMqe9QzbOi8WQ}"
write_success "Environment variables configured"

# Create data directory
mkdir -p data
write_success "Data directory ready"

# Install dependencies
write_info "Installing local requirements (aiosqlite)..."
python -m pip install -q -r backend/requirements-local.txt
write_success "Dependencies installed"

# Determine reload mode
RELOAD_MODE="${BACKEND_RELOAD:-}"

write_header "Starting Backend"
echo ""
echo "Backend API: http://127.0.0.1:8000"
echo "API Docs:    http://127.0.0.1:8000/docs"
echo "Login:       admin@example.com / admin123"
echo ""

if [ "$RELOAD_MODE" = "1" ] || [ "$RELOAD_MODE" = "true" ]; then
  write_info "Reload mode: ON (watching backend/ directory)"
  python -m uvicorn backend.app.main:app \
    --reload \
    --reload-dir backend \
    --host 127.0.0.1 \
    --port 8000
else
  write_info "Reload mode: OFF"
  write_info "Set BACKEND_RELOAD=1 to enable reload on changes"
  python -m uvicorn backend.app.main:app \
    --host 127.0.0.1 \
    --port 8000
fi

