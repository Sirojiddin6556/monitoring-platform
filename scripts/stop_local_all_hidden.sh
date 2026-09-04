#!/usr/bin/env bash
#######################################
# Stop backend and frontend services
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
NC='\033[0m'

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

get_pid_from_file() {
  if [ -f "$1" ]; then
    head -n 1 "$1" 2>/dev/null || echo ""
  fi
}

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║       Stopping Monitoring Platform Services           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Stop backend
if [ -f "$BACKEND_PID_FILE" ]; then
  pid=$(get_pid_from_file "$BACKEND_PID_FILE")
  if [ -n "$pid" ]; then
    write_status warning "Stopping backend (PID: $pid)..."
    kill -9 "$pid" 2>/dev/null || true
    write_status success "Backend stopped"
  fi
  rm -f "$BACKEND_PID_FILE"
fi

# Stop frontend
if [ -f "$FRONTEND_PID_FILE" ]; then
  pid=$(get_pid_from_file "$FRONTEND_PID_FILE")
  if [ -n "$pid" ]; then
    write_status warning "Stopping frontend (PID: $pid)..."
    kill -9 "$pid" 2>/dev/null || true
    write_status success "Frontend stopped"
  fi
  rm -f "$FRONTEND_PID_FILE"
fi

# Kill lingering processes on ports
write_status info "Cleaning up port listeners..."
lsof -ti:8000 2>/dev/null | xargs kill -9 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null || true

# Kill any remaining uvicorn/next processes
pgrep -f "uvicorn backend.app.main:app" 2>/dev/null | xargs kill -9 2>/dev/null || true
pgrep -f "next dev" 2>/dev/null | xargs kill -9 2>/dev/null || true

echo ""
echo -e "${GREEN}✓ All services stopped${NC}"
echo ""
