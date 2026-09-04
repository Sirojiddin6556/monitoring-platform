#!/usr/bin/env bash
#######################################
# Start backend and frontend locally
# Both services run in the background
#######################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUNTIME_DIR="$PROJECT_ROOT/.runtime"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
FRONTEND_PID_FILE="$RUNTIME_DIR/frontend.pid"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color

write_status() {
  local type=$1
  local message=$2
  local timestamp=$(date '+%H:%M:%S')
  
  case $type in
    success) echo -e "${GREEN}[$timestamp] ✓ $message${NC}" ;;
    error) echo -e "${RED}[$timestamp] ✗ $message${NC}" >&2 ;;
    warning) echo -e "${YELLOW}[$timestamp] ⚠ $message${NC}" ;;
    info) echo -e "${CYAN}[$timestamp] ℹ $message${NC}" ;;
  esac
}

cleanup() {
  write_status error "Script interrupted"
  exit 1
}

trap cleanup INT TERM

# Create runtime directory
mkdir -p "$RUNTIME_DIR"

# Function to get PID from file
get_pid_from_file() {
  if [ -f "$1" ]; then
    head -n 1 "$1" 2>/dev/null || echo ""
  fi
}

# Function to check if process is running
is_running() {
  local pid=$1
  if [ -z "$pid" ]; then return 1; fi
  kill -0 "$pid" 2>/dev/null
}

# Stop existing services
write_status info "Checking for existing services..."

# Stop backend
if [ -f "$BACKEND_PID_FILE" ]; then
  pid=$(get_pid_from_file "$BACKEND_PID_FILE")
  if is_running "$pid"; then
    write_status warning "Stopping existing backend (PID: $pid)"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi
  rm -f "$BACKEND_PID_FILE"
fi

# Stop frontend
if [ -f "$FRONTEND_PID_FILE" ]; then
  pid=$(get_pid_from_file "$FRONTEND_PID_FILE")
  if is_running "$pid"; then
    write_status warning "Stopping existing frontend (PID: $pid)"
    kill -9 "$pid" 2>/dev/null || true
    sleep 0.5
  fi
  rm -f "$FRONTEND_PID_FILE"
fi

# Kill lingering processes on ports
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 0.5

write_status success "Cleaned up old processes"

cd "$PROJECT_ROOT"

# Verify prerequisites
write_status info "Verifying prerequisites..."

if [ ! -f "venv/bin/python" ]; then
  write_status error "Python venv not found. Run: python -m venv venv"
  exit 1
fi

if [ ! -f "frontend/node_modules/.bin/next" ]; then
  write_status error "Next.js not found. Run: cd frontend && npm install"
  exit 1
fi

write_status success "All prerequisites verified"

# Setup environment
write_status info "Configuring backend environment..."
export DATABASE_URL="${DATABASE_URL:-sqlite+aiosqlite:///./data/monitoring.db}"
export DEV_ALLOW_INSECURE_SECRET="1"
export ENVIRONMENT="local"
export SECRET_KEY="${SECRET_KEY:-dev-secret-key-change-me}"
export INITIAL_ADMIN_EMAIL="${INITIAL_ADMIN_EMAIL:-admin@example.com}"
export INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-admin123}"
export INGEST_API_KEY="${INGEST_API_KEY:-5aaOHADSpi7ER87pvC4U8oeQaYEhGhbMqe9QzbOi8WQ}"

mkdir -p data
write_status success "Backend environment configured"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  Monitoring Platform - Local Development Server       ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Start backend
write_status info "Starting backend service..."
# shellcheck source=/dev/null
. venv/bin/activate

python -m uvicorn backend.app.main:app \
  --host 127.0.0.1 \
  --port 8000 \
  >> "$RUNTIME_DIR/backend.out.log" 2>> "$RUNTIME_DIR/backend.err.log" &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
write_status success "Backend started (PID: $BACKEND_PID)"

# Start frontend
write_status info "Starting frontend service..."
cd frontend
npm run dev -- -H 0.0.0.0 -p 3000 \
  >> "$RUNTIME_DIR/frontend.out.log" 2>> "$RUNTIME_DIR/frontend.err.log" &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
write_status success "Frontend started (PID: $FRONTEND_PID)"
cd "$PROJECT_ROOT"

# Show startup info
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║          Services Started Successfully               ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo -e "${CYAN}Frontend:${NC}    http://127.0.0.1:3000"
echo -e "${CYAN}Backend API:${NC} http://127.0.0.1:8000"
echo -e "${CYAN}API Docs:${NC}    http://127.0.0.1:8000/docs"
echo ""
echo -e "${YELLOW}Default credentials:${NC}"
echo "  Email:    admin@example.com"
echo "  Password: admin123"
echo ""
echo -e "${GRAY}Logs:${NC}"
echo "  Backend:  .runtime/backend.out.log"
echo "  Frontend: .runtime/frontend.out.log"
echo ""
echo -e "${GRAY}To stop services: bash ./scripts/stop_local_all_hidden.sh${NC}"
echo ""

# Keep script running and monitor services
while true; do
  sleep 5
  
  if ! is_running "$BACKEND_PID" 2>/dev/null; then
    write_status error "Backend service stopped!"
    break
  fi
  
  if ! is_running "$FRONTEND_PID" 2>/dev/null; then
    write_status error "Frontend service stopped!"
    break
  fi
done
