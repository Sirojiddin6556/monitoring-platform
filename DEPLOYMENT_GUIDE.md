# Production Cleanup and Deployment Guide

## FILES TO REMOVE (Development-Only)
The following files should be removed before production deployment:

### Development Build Artifacts
- ✅ `MonitoringAgent.spec` - PyInstaller spec file
- ✅ `MonitoringAgentInstaller.spec` - Installer spec file  
- ✅ `run_local_all_hidden.ps1` - Local dev script
- ✅ `run_local_all_hidden.vbs` - Local dev script
- ✅ `stop_local_all_hidden.ps1` - Local dev script
- ✅ `stop_local_all_hidden.vbs` - Local dev script
- ✅ `backend_err.log` - Local dev logs
- ✅ `backend_out.log` - Local dev logs
- ✅ `agent/` - Local Windows agent build directory
- ✅ `build/` - Build artifacts
- ✅ `dist/` - Distribution artifacts
- ✅ `data/` - Local development database

### IDE/Editor Files (Already in .gitignore, but verify)
- `.claude/` - Claude Code session data
- `.runtime/` - Runtime cache
- `.vscode/` - VSCode settings
- `.next/` - Next.js build cache
- `node_modules/` - Frontend dependencies
- `__pycache__/` - Python cache

### Development-Only Dependencies
- `backend/requirements-local.txt` - Use only `requirements.txt` in production

### Local Environment Files  
- `.env.local` - Use `.env.prod` instead
- `.env.development` - Use `.env.prod` instead

## GITHUB WORKFLOWS TO UPDATE

File: `.github/workflows/ci.yml`
- Add step to validate .env.prod is not committed
- Add step to verify production dependencies
- Add step to check for development-only files

## DOCKER CLEANUP

Ensure Dockerfiles do not include:
- Development dependencies (requirements-local.txt)
- Build artifacts (/dist, /build)
- Log files
- Local configuration files

## DEPLOYMENT STEPS

### 1. Pre-Deployment Verification
```bash
# Verify no dev files are included
git status --short

# Verify .env.prod exists and is properly filled
cat infrastructure/.env.prod | grep "ЗАМЕНИ\|GenerateStrong" && echo "ERROR: Replace placeholders!" || echo "OK"

# Verify PostgreSQL is configured (not SQLite)
grep "postgresql://" infrastructure/.env.prod || echo "ERROR: Use PostgreSQL!"
```

### 2. Build Production Images
```bash
docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml build
```

### 3. Deploy
```bash
docker-compose -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.prod.yml up -d
```

### 4. Verify Deployment
```bash
# Check backend health
curl -s http://localhost:8000/health

# Check WebSocket connection
curl -i -N -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:8000/ws?token=YOUR_JWT_TOKEN

# Test agent metrics endpoint
curl -X POST http://localhost:8000/api/metrics \
  -H "Content-Type: application/json" \
  -H "X-Ingest-Key: YOUR_INGEST_API_KEY" \
  -d '{"server_id":"test","metrics":{"cpu":{"value":50,"unit":"%"}}}'
```

## SECURITY CHECKLIST

- [ ] All credentials replaced with production values
- [ ] SECRET_KEY is unique (not the example value)
- [ ] FIELD_ENCRYPTION_KEY is unique (not the example value)
- [ ] INGEST_API_KEY is strong random string
- [ ] ALLOWED_ORIGINS set to production domain
- [ ] ALLOW_INSECURE_TLS set to false
- [ ] ALLOW_LOCAL_INGEST_WITHOUT_KEY set to false
- [ ] Initial admin password changed after first login
- [ ] PostgreSQL password changed from example
- [ ] Reverse proxy (nginx/traefik) configured for HTTPS
- [ ] Rate limiting configured
- [ ] Logging and monitoring set up
- [ ] Backups scheduled and tested

## MONITORING SETUP

### Prometheus Metrics
- Built-in Prometheus endpoint: `/metrics`
- Metrics collection interval configurable

### Health Checks
- Backend health: `GET /health`
- Database connectivity: SQL health check
- Agent connectivity: Monitor `/api/metrics` endpoint

### Recommended Monitoring
- CPU/Memory usage of services
- Request latency and error rates
- Database query performance
- WebSocket connection count
- Disk space for database
- Agent connectivity success rate

## DOCUMENTATION FOR OPS TEAM

- [ ] Create runbook for deployment
- [ ] Document monitoring and alerting setup
- [ ] Create disaster recovery procedures
- [ ] Document scaling procedures
- [ ] Create troubleshooting guide
