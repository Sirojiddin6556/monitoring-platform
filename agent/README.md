# Monitoring Agent v3.0 (Go)

Лёгкий агент мониторинга для Windows и Linux. Runtime теперь написан на Go и собирается в самостоятельные бинарники без Python/venv:

- `MonitoringAgent.exe` для Windows
- `monitoring-agent-linux-amd64` / `monitoring-agent-linux-arm64` для Linux
- Docker image на Go runtime

Старый `app.py` оставлен только как legacy/reference для сравнения поведения. Установщики, GUI и Dockerfile используют Go-бинарник.

## Что собирает

- CPU, RAM, swap, disks, disk I/O
- network throughput, interfaces, TCP connection states
- system info, uptime, top processes
- Docker containers через `docker ps` + `docker stats`
- Windows services и Windows Event Log
- systemd services на Linux
- open ports, SSH sessions, failed Windows logins
- Hyper-V, VirtualBox, VMware VMs
- temperatures на Linux, battery hook where available
- agent self metrics: PID, memory, last send time, offline buffer length

## Конфигурация

Агент читает переменные окружения и файл `agent.env` рядом с бинарником. Переменные окружения имеют приоритет.

| Variable | Default | Description |
| --- | --- | --- |
| `BACKEND_URL` | `http://127.0.0.1:8000` | Backend base URL. Must start with `http://` or `https://`. |
| `SERVER_ID` | `srv-local` | Safe server id. Non `[a-zA-Z0-9_.-]` chars are replaced. |
| `INTERVAL` | `15` | Collection interval in seconds, minimum `1`. |
| `INGEST_API_KEY` | empty | Sent as `X-Ingest-Key`. |
| `AGENT_KEY` | empty | Backward-compatible alias for `INGEST_API_KEY`. |
| `AGENT_FORCE_START` | `0` | Start even when `.agent_paused` exists. |
| `ALLOW_INSECURE_BACKEND` | `0` | Suppress warning for non-local `http://` backend. |

Example `agent.env`:

```env
BACKEND_URL=https://monitoring.example.com
SERVER_ID=web-prod-01
INTERVAL=15
INGEST_API_KEY=change-me
```

## Build

Windows:

```powershell
cd agent
go build -trimpath -ldflags "-s -w" -o MonitoringAgent.exe .
```

Linux amd64 from Windows PowerShell:

```powershell
cd agent
$env:GOOS="linux"; $env:GOARCH="amd64"
go build -trimpath -ldflags "-s -w" -o monitoring-agent-linux-amd64 .
Remove-Item Env:\GOOS, Env:\GOARCH -ErrorAction SilentlyContinue
```

All supported artifacts:

```powershell
cd agent
.\build.ps1 -All
```

## Run Manually

Windows:

```powershell
$env:BACKEND_URL="http://127.0.0.1:8000"
$env:SERVER_ID="win-local"
$env:INGEST_API_KEY="devkey"
.\MonitoringAgent.exe
```

Linux:

```bash
export BACKEND_URL=http://127.0.0.1:8000
export SERVER_ID=linux-local
export INGEST_API_KEY=devkey
./monitoring-agent-linux-amd64
```

## Install

Windows Task Scheduler:

```powershell
.\install.ps1 -BackendUrl "https://monitoring.example.com" -ServerId "win-prod-01" -Interval 15 -AgentKey "secret"
```

Linux systemd:

```bash
chmod +x install.sh monitoring-agent-linux-amd64
./install.sh --backend https://monitoring.example.com --server-id linux-prod-01 --interval 15 --agent-key secret
```

Installed layout:

```text
C:\monitoring-agent\
  MonitoringAgent.exe
  VERSION
  agent.env
  start.ps1
  uninstall.ps1

/opt/monitoring-agent/
  monitoring-agent
  VERSION
  agent.env
  uninstall.sh
```

## Docker

Build:

```bash
docker build -t monitoring-agent ./agent
```

Run:

```bash
docker run -d --name monitoring-agent --restart unless-stopped \
  -e BACKEND_URL=http://host.docker.internal:8000 \
  -e SERVER_ID=docker-host-01 \
  -e INGEST_API_KEY=devkey \
  -v /var/run/docker.sock:/var/run/docker.sock \
  monitoring-agent
```

The image includes `docker-cli` so Docker container metrics work when the host socket is mounted.

## Runtime Design

- Fast collectors run in the main cycle.
- Slow collectors run concurrently through goroutines and a TTL cache:
  - Docker, services, security: `max(INTERVAL, 60s)`
  - logs, VMs, temperatures: `max(INTERVAL, 120s)`
- Offline sends are buffered in memory, max 25 payloads.
- On each successful send, `agent_heartbeat.json` is atomically updated next to the binary.
- On Windows, subprocesses are launched hidden with `CREATE_NO_WINDOW`.
- `.agent_paused` next to the binary stops startup; on Windows it is also polled during sleep.

## Payload

The agent posts JSON to:

```text
POST {BACKEND_URL}/api/metrics
Content-Type: application/json
X-Ingest-Key: <INGEST_API_KEY>
```

Top-level shape:

```json
{
  "service": "agent",
  "agent_version": "3.0.0",
  "timestamp": 1748635200,
  "server_id": "web-prod-01",
  "metric": "system",
  "status": "ok",
  "warmup": false,
  "metrics": {},
  "system_info": {},
  "cpu_detail": {},
  "ram_detail": {},
  "swap_detail": {},
  "disks": [],
  "disk_io": {},
  "network_interfaces": [],
  "network_connections": {},
  "processes_detail": {},
  "services": [],
  "docker_containers": [],
  "virtual_machines": [],
  "recent_logs": {"system": [], "auth": [], "error": []},
  "security": {"open_ports": [], "active_ssh_sessions": 0, "failed_logins_24h": 0},
  "temperatures": [],
  "battery": null,
  "agent_self": {}
}
```

## Troubleshooting

Run checks:

```powershell
go test ./...
go build -trimpath -ldflags "-s -w" -o MonitoringAgent.exe .
```

Common issues:

- No server appears: check `SERVER_ID`, backend `/health`, and `INGEST_API_KEY`.
- Docker metrics empty: check `docker ps`; in Docker mount `/var/run/docker.sock`.
- Windows failed logins are `0`: run as Administrator or add the user to `Event Log Readers`.
- Non-local `http://` backend logs a warning: use HTTPS in production.
