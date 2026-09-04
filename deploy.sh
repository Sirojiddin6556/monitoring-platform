#!/bin/bash
# DEPLOY SCRIPT - Monitoring Platform Production Deployment
# Usage: bash deploy.sh

set -e  # Exit on error

echo "🚀 Monitoring Platform - Production Deployment"
echo "================================================"

# Check if .env.prod exists
if [ ! -f "infrastructure/.env.prod" ]; then
    echo "❌ ERROR: infrastructure/.env.prod not found!"
    echo "Create from infrastructure/.env.example first"
    exit 1
fi

# Validate .env.prod
echo "🔍 Validating configuration..."
if grep -q "ЗАМЕНИ\|GenerateStrong" infrastructure/.env.prod; then
    echo "❌ ERROR: .env.prod contains placeholder values!"
    echo "Replace all placeholder values before deployment"
    exit 1
fi

if ! grep -q "postgresql://" infrastructure/.env.prod; then
    echo "❌ ERROR: Must use PostgreSQL, not SQLite!"
    exit 1
fi

echo "✅ Configuration validated"

# Build Docker images
echo ""
echo "📦 Building Docker images..."
docker-compose -f infrastructure/docker-compose.yml build

# Start services with production config
echo ""
echo "🐳 Starting services with production configuration..."
docker-compose -f infrastructure/docker-compose.yml \
               -f infrastructure/docker-compose.prod.yml up -d

# Wait for services to be healthy
echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check backend health
echo ""
echo "🏥 Checking backend health..."
if curl -s http://localhost:8000/health | grep -q "ok\|healthy"; then
    echo "✅ Backend is healthy"
else
    echo "⚠️  Backend health check endpoint not responding yet..."
fi

# Verify database connection
echo ""
echo "💾 Verifying database connection..."
if docker exec monitoring_postgres_1 pg_isready -U monitoring_prod 2>/dev/null; then
    echo "✅ Database is ready"
else
    echo "⚠️  Database connection check..."
fi

# Display deployment info
echo ""
echo "================================================"
echo "✅ DEPLOYMENT COMPLETE"
echo "================================================"
echo ""
echo "📍 Service URLs:"
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:3000"
echo "   Health: http://localhost:8000/health"
echo ""
echo "📝 Next Steps:"
echo "   1. Access frontend at http://localhost:3000"
echo "   2. Login with initial admin credentials"
echo "   3. Configure agent INGEST_API_KEY: $(grep INGEST_API_KEY infrastructure/.env.prod | cut -d= -f2)"
echo "   4. Start agent with:"
echo "      export BACKEND_URL=http://YOUR_BACKEND_IP:8000"
echo "      export SERVER_ID=your-server-id"
echo "      export INGEST_API_KEY=$(grep INGEST_API_KEY infrastructure/.env.prod | cut -d= -f2)"
echo "      cd agent && go build -trimpath -ldflags='-s -w' -o monitoring-agent-linux-amd64 . && ./monitoring-agent-linux-amd64"
echo ""
echo "🔒 Security Notes:"
echo "   ⚠️  Use HTTPS/TLS in production (configure reverse proxy)"
echo "   ⚠️  Change initial admin password immediately"
echo "   ⚠️  Restrict network access to backends"
echo "   ⚠️  Enable automated backups"
echo ""
echo "📊 Monitoring:"
echo "   Prometheus metrics: http://localhost:8000/metrics"
echo "   WebSocket: ws://localhost:8000/ws (with JWT token)"
echo ""
