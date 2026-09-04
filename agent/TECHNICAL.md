# Monitoring Agent (Go) - Technical Notes

This document describes the production Go runtime. The old Python `app.py` is retained only as a migration reference.

## Entry Point

`main.go` owns the lifecycle:

1. Load config from env and `agent.env`.
2. Warm up CPU and process CPU baselines.
3. Create TTL caches and HTTP sender.
4. Collect metrics every `INTERVAL` seconds.
5. Send payload to `POST /api/metrics`.
6. Handle `SIGTERM` / `SIGINT` and Windows pause flag.

## Files

| File | Role |
| --- | --- |
| `main.go` | Main loop, payload assembly, signal handling. |
| `config.go` | Env parsing, `agent.env`, server id sanitization, version reading. |
| `payload.go` | JSON payload structs matching backend API. |
| `sender.go` | HTTP client, retries, in-memory offline buffer, heartbeat write. |
| `cache.go` | Generic TTL cache with in-flight de-duplication. |
| `collectors.go` | Cross-platform fast collectors via `gopsutil`. |
| `collectors_shared.go` | Docker CLI parser, VM helpers, shared text parsing. |
| `collectors_windows.go` | Windows services, logs, security, VM discovery, hidden subprocesses. |
| `collectors_other.go` | Linux/macOS load, temperatures, systemd services, security, Docker. |
| `syscall_windows.go` | Windows `CREATE_NO_WINDOW` subprocess attributes. |
| `installer/main.go` | Go GUI/CLI installer helper. |

## Collector Model

Fast collectors run in the main loop:

- `collectCPU`
- `collectRAM`
- `collectSwap`
- `collectDisks`
- `collectNetwork`
- `collectSysInfo`
- `collectProcesses`
- `collectBattery`
- `collectLoadAvg`

Slow collectors run concurrently in `collectSlowMetrics`:

- Docker containers
- VMs
- services
- security
- recent logs
- temperatures

Each slow collector is wrapped in a TTL cache. Cold cache latency is approximately the maximum slow collector runtime, not the sum.

## Cache Semantics

`Cache[T]` stores values by key:

- returns fresh values until TTL expires
- allows one in-flight producer per key
- concurrent callers wait for the producer instead of spawning duplicate subprocesses

TTL policy:

| Collector | TTL |
| --- | --- |
| Docker | `max(INTERVAL, 60s)` |
| Services | `max(INTERVAL, 60s)` |
| Security | `max(INTERVAL, 60s)` |
| Recent logs | `max(INTERVAL, 120s)` |
| VMs | `max(INTERVAL, 120s)` |
| Temperatures | `max(INTERVAL, 120s)` |

## Sender

`Sender.Send`:

1. Marshals payload to JSON.
2. Flushes at most one buffered payload.
3. Posts the current payload.
4. Buffers current payload on failure.
5. Writes `agent_heartbeat.json` after successful current send.

HTTP behavior:

- endpoint: `{BACKEND_URL}/api/metrics`
- timeout: 20 seconds
- retries: 3 attempts with small backoff
- no retry loop for `4xx`
- header `X-Ingest-Key` when `INGEST_API_KEY` or `AGENT_KEY` is set
- buffer limit: 25 payloads, oldest dropped when full

## Counter Safety

Disk and network counters are unsigned. The Go implementation uses guarded deltas so counter resets, interface re-creation, VM adapters, or reboot-like counter drops produce `0` delta instead of underflow spikes.

## Windows Notes

- External commands are started with `CREATE_NO_WINDOW`.
- PowerShell queries use `-NoProfile -NonInteractive -ExecutionPolicy Bypass`.
- Security log access may require Administrator or `Event Log Readers`.
- The GUI pause flag is `.agent_paused` next to the executable.

## Linux Notes

- Services are read through `systemctl list-units`.
- Temperatures use `host.SensorsTemperatures`.
- Docker metrics require a working Docker CLI and permission to access Docker.
- Running in Docker requires mounting `/var/run/docker.sock` for Docker metrics.

## Build Matrix

```powershell
go test ./...
go build -trimpath -ldflags "-s -w" -o MonitoringAgent.exe .
$env:GOOS="linux"; $env:GOARCH="amd64"; go build -trimpath -ldflags "-s -w" -o monitoring-agent-linux-amd64 .
```

`build.ps1 -All` builds Windows amd64, Linux amd64, Linux arm64, and the WPF GUI when `dotnet` is available.
