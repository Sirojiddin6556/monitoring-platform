#!/bin/sh
set -e
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o monitoring-agent-linux-amd64 .
cp -f monitoring-agent-linux-amd64 monitoring-agent
chmod +x monitoring-agent-linux-amd64 monitoring-agent
echo "Build complete successfully!"
ls -lh monitoring-agent-linux-amd64
