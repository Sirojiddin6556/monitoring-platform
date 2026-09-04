"""
Monitoring Agent — сбор метрик и отправка на backend.
Не открывает cmd/PowerShell окна. Работает без прав администратора.
"""
import asyncio
import base64
import collections
import concurrent.futures
import datetime
import json
import logging
import os
import platform
import re
import signal
import socket
import sys
import threading
import time

import httpx
import psutil

# ─── Версия ──────────────────────────────────────────────────────────────────
def _read_version() -> str:
    ver_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")
    try:
        with open(ver_file, encoding="utf-8") as f:
            v = f.read().strip()
            if v:
                return v
    except Exception:
        pass
    return "3.0.0"


AGENT_VER = _read_version()

# ─── Конфигурация из переменных окружения ────────────────────────────────────
_raw_backend = os.getenv("BACKEND_URL", "http://127.0.0.1:8000").strip().rstrip("/")
_raw_server  = os.getenv("SERVER_ID",   "srv-local").strip()

# Validate URL scheme to prevent file:// or other unexpected protocols
if not _raw_backend.startswith(("http://", "https://")):
    _raw_backend = "http://127.0.0.1:8000"

# Sanitize SERVER_ID: only safe chars, max 64
_server_clean = re.sub(r"[^a-zA-Z0-9_\-.]", "-", _raw_server)[:64].strip("-")
SERVER_ID   = _server_clean or "srv-local"
BACKEND_URL = _raw_backend
INTERVAL    = max(1, int(os.getenv("INTERVAL", "15")))
INGEST_KEY  = os.getenv("AGENT_KEY", "").strip() or os.getenv("INGEST_API_KEY", "").strip()
FORCE_START = os.getenv("AGENT_FORCE_START", "0").strip().lower() in {"1", "true", "yes", "on"}
ALLOW_INSECURE_BACKEND = os.getenv("ALLOW_INSECURE_BACKEND", "false").strip().lower() in {"1", "true", "yes", "on"}

IS_WINDOWS = platform.system().lower() == "windows"
_HERE      = os.path.dirname(os.path.abspath(__file__))
PAUSE_FLAG = os.path.join(_HERE, ".agent_paused")
_HEARTBEAT = os.path.join(_HERE, "agent_heartbeat.json")

# ─── Логгер ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s [agent] %(levelname)s %(message)s",
)
logger = logging.getLogger("agent")

# ─── Runtime state ───────────────────────────────────────────────────────────
_warmup_done         = False                                   # flips True after first collection
_last_send_ms        = 0.0                                    # duration of last send_metrics call
_send_buffer: collections.deque = collections.deque(maxlen=25)  # offline payload buffer
_buffer_lock         = threading.Lock()                       # guards _send_buffer check-then-act
_security_log_warned = False                                  # emit failed_logins warning only once
_shutdown            = threading.Event()                      # set to trigger graceful exit
_executor     = concurrent.futures.ThreadPoolExecutor(        # bounded pool for slow collectors
    max_workers=8, thread_name_prefix="agent-slow")


def _write_heartbeat(data: dict) -> None:
    """Atomic heartbeat write — safe against partial writes if process is killed."""
    tmp = _HEARTBEAT + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp, _HEARTBEAT)
    except OSError:
        # Fallback for cross-device junction points (rare on Windows)
        try:
            with open(_HEARTBEAT, "w", encoding="utf-8") as f:
                json.dump(data, f)
        except Exception:
            pass
    except Exception:
        pass

# ─── TTL-кэш ─────────────────────────────────────────────────────────────────
_cache: dict = {}
_cache_lock = threading.Lock()
_in_flight: dict[str, threading.Event] = {}


def _is_paused() -> bool:
    return os.path.exists(PAUSE_FLAG)


# ─── Вспомогательная функция для subprocess без окна ─────────────────────────
def _run(cmd, timeout=8):
    import subprocess
    kwargs = dict(capture_output=True, text=True, timeout=timeout)
    if IS_WINDOWS:
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    try:
        return subprocess.run(cmd, **kwargs)
    except Exception as exc:
        logger.debug("_run %s: %s", cmd[0] if cmd else "?", exc)
        return None


# ────────────────────────────────────────────────────────────────────────────
# Сборщики метрик — быстрые
# ────────────────────────────────────────────────────────────────────────────

def _cpu():
    d = psutil.cpu_percent(interval=None)
    freq = psutil.cpu_freq()
    per_core = [round(x, 1) for x in (psutil.cpu_percent(percpu=True) or [])]
    times = psutil.cpu_times_percent(interval=None)
    stats = psutil.cpu_stats()
    return {
        "percent":        round(d, 1),
        "cores_logical":  psutil.cpu_count(logical=True) or 0,
        "cores_physical": psutil.cpu_count(logical=False) or 0,
        "freq_mhz":       round(freq.current, 0) if freq else 0,
        "freq_min":       round(freq.min, 0) if freq and freq.min else 0,
        "freq_max":       round(freq.max, 0) if freq and freq.max else 0,
        "per_core":       per_core,
        "user":           round(getattr(times, "user",   0), 1),
        "system":         round(getattr(times, "system", 0), 1),
        "idle":           round(getattr(times, "idle",   0), 1),
        "iowait":         round(getattr(times, "iowait", 0) if hasattr(times, "iowait") else 0, 1),
        "ctx_switches":   stats.ctx_switches if stats else 0,
        "interrupts":     stats.interrupts   if stats else 0,
    }


def _ram():
    m = psutil.virtual_memory()
    return {
        "total_gb":     round(m.total     / 1073741824, 2),
        "used_gb":      round(m.used      / 1073741824, 2),
        "available_gb": round(m.available / 1073741824, 2),
        "free_gb":      round(m.free      / 1073741824, 2),
        "cached_gb":    round(getattr(m, "cached",  0) / 1073741824, 2),
        "buffers_gb":   round(getattr(m, "buffers", 0) / 1073741824, 2),
        "percent":      round(m.percent, 1),
    }


def _swap():
    s = psutil.swap_memory()
    return {
        "total_gb": round(s.total / 1073741824, 2),
        "used_gb":  round(s.used  / 1073741824, 2),
        "percent":  round(s.percent, 1),
    }


def _disks():
    parts = []
    for p in psutil.disk_partitions(all=False):
        try:
            u = psutil.disk_usage(p.mountpoint)
            parts.append({
                "device":     p.device,
                "mountpoint": p.mountpoint,
                "fstype":     p.fstype,
                "total_gb":   round(u.total / 1073741824, 2),
                "used_gb":    round(u.used  / 1073741824, 2),
                "free_gb":    round(u.free  / 1073741824, 2),
                "percent":    round(u.percent, 1),
            })
        except (PermissionError, OSError):
            continue
    return parts


def _disk_io(prev_dio, dt):
    try:
        cur = psutil.disk_io_counters()
        if prev_dio and cur and dt > 0.1:
            return cur, {
                "read_mb_s":  round((cur.read_bytes  - prev_dio.read_bytes)  / dt / 1048576, 2),
                "write_mb_s": round((cur.write_bytes - prev_dio.write_bytes) / dt / 1048576, 2),
                "iops_read":  round((cur.read_count  - prev_dio.read_count)  / dt, 1),
                "iops_write": round((cur.write_count - prev_dio.write_count) / dt, 1),
            }
        return cur, {"read_mb_s": 0, "write_mb_s": 0, "iops_read": 0, "iops_write": 0}
    except Exception:
        return None, {"read_mb_s": 0, "write_mb_s": 0, "iops_read": 0, "iops_write": 0}


def _network(prev_net, prev_nic, dt):
    cur_total = psutil.net_io_counters()
    cur_nic   = psutil.net_io_counters(pernic=True)

    if dt > 0.1:
        net_in  = round((cur_total.bytes_recv - prev_net.bytes_recv) * 8 / dt / 1e6, 3)
        net_out = round((cur_total.bytes_sent - prev_net.bytes_sent) * 8 / dt / 1e6, 3)
    else:
        net_in = net_out = 0.0

    try:
        if_stats = psutil.net_if_stats()
    except Exception:
        if_stats = {}

    interfaces = []
    for name, c in cur_nic.items():
        lname = name.lower()
        # Skip classic loopback names
        if lname == "lo" or "loopback" in lname:
            continue
        # Skip interfaces marked as down or loopback by psutil flags (Linux)
        st = if_stats.get(name)
        if st is not None:
            if not st.isup:
                continue
            flags = getattr(st, "flags", "") or ""
            if "loopback" in flags.lower():
                continue

        prev = prev_nic.get(name)
        s_in = s_out = 0.0
        if prev and dt > 0.1:
            s_in  = round((c.bytes_recv - prev.bytes_recv) * 8 / dt / 1e6, 3)
            s_out = round((c.bytes_sent - prev.bytes_sent) * 8 / dt / 1e6, 3)
        interfaces.append({
            "name":           name,
            "speed_in_mbps":  max(0.0, s_in),
            "speed_out_mbps": max(0.0, s_out),
            "bytes_recv":     c.bytes_recv,
            "bytes_sent":     c.bytes_sent,
            "errors_in":      c.errin,
            "errors_out":     c.errout,
            "drops_in":       c.dropin,
            "drops_out":      c.dropout,
        })

    try:
        conns = psutil.net_connections(kind="tcp")
        conn_stats: dict[str, int] = {}
        for c in conns:
            conn_stats[c.status] = conn_stats.get(c.status, 0) + 1
    except Exception:
        conn_stats = {}

    return (
        cur_total, cur_nic,
        max(0.0, net_in), max(0.0, net_out),
        interfaces,
        {"total": sum(conn_stats.values()), "by_status": conn_stats},
    )


def _sys_info():
    boot = psutil.boot_time()
    u = platform.uname()
    os_version = u.version if u.version else f"{u.system} {u.release}"
    return {
        "os":           f"{u.system} {u.release}",
        "os_version":   os_version,
        "kernel":       u.release,
        "hostname":     socket.gethostname(),
        "architecture": u.machine,
        "boot_time":    datetime.datetime.fromtimestamp(boot).strftime("%Y-%m-%d %H:%M:%S"),
        "uptime_hours": round((time.time() - boot) / 3600, 1),
    }


def _processes(top_n=10):
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_info", "status"]):
        try:
            info = p.info
            if info["pid"] == 0:
                continue
            mem_mb = round(info["memory_info"].rss / 1048576, 1) if info.get("memory_info") else 0
            procs.append({
                "pid":    info["pid"],
                "name":   info["name"] or "?",
                "cpu":    round(info.get("cpu_percent") or 0, 1),
                "ram_mb": mem_mb,
                "status": info["status"],
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    by_cpu = sorted(procs, key=lambda x: x["cpu"], reverse=True)[:top_n]
    by_ram = sorted(procs, key=lambda x: x["ram_mb"], reverse=True)[:top_n]
    return {"total": len(procs), "top_cpu": by_cpu, "top_ram": by_ram}


def _load_avg(cpu_pct, cores):
    try:
        la = psutil.getloadavg()
        return la[0], la[1], la[2]
    except (AttributeError, OSError):
        approx = cpu_pct / 100.0 * cores
        return approx, approx, approx


def _battery():
    try:
        bat = psutil.sensors_battery()
        if bat:
            return {
                "percent":       round(bat.percent, 1),
                "power_plugged": bat.power_plugged,
                "secs_left":     bat.secsleft if bat.secsleft != psutil.POWER_TIME_UNLIMITED else -1,
            }
    except Exception:
        pass
    return None


# ────────────────────────────────────────────────────────────────────────────
# Сборщики метрик — медленные (запускаются через executor + TTL-кэш)
# ────────────────────────────────────────────────────────────────────────────

def _docker():
    # --no-trunc gives full container IDs to avoid 12-char collisions
    result = _run(["docker", "ps", "-a", "--format", "{{json .}}", "--no-trunc"], timeout=10)
    if not result or result.returncode != 0:
        return None
    if not result.stdout.strip():
        return []

    stats_map = {}
    st = _run(["docker", "stats", "--no-stream", "--format", "{{json .}}"], timeout=12)
    if st and st.returncode == 0:
        for line in st.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
                name = row.get("Name") or row.get("Container")
                if not name:
                    continue

                def _pct(v):
                    try:
                        return round(float(str(v).strip().rstrip("%").replace(",", ".")), 2)
                    except Exception:
                        return 0.0

                mem_raw = str(row.get("MemUsage", "0")).split("/")[0].strip().split()
                mem_mb = 0.0
                if mem_raw:
                    try:
                        val = float(mem_raw[0].replace(",", "."))
                        unit = mem_raw[1].lower() if len(mem_raw) > 1 else "mb"
                        mem_mb = val * 1024 if unit.startswith("g") else val / 1024 if unit.startswith("k") else val
                    except Exception:
                        pass
                stats_map[name] = {
                    "cpu_percent": _pct(row.get("CPUPerc")),
                    "mem_percent": _pct(row.get("MemPerc")),
                    "mem_mb":      round(mem_mb, 1),
                }
            except Exception:
                continue

    containers = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        status_text = (row.get("Status") or "").lower()
        state = (row.get("State") or "").lower()
        if not state:
            state = "running" if status_text.startswith("up") else "exited" if "exited" in status_text else "unknown"
        name = row.get("Names") or row.get("Name") or ""
        full_id = row.get("ID") or ""  # full ID, no truncation
        st_info = stats_map.get(name, {})
        containers.append({
            "id":          full_id,
            "name":        name,
            "image":       row.get("Image") or "",
            "status":      state,
            "cpu_percent": st_info.get("cpu_percent", 0),
            "mem_mb":      st_info.get("mem_mb", 0),
            "mem_percent": st_info.get("mem_percent", 0),
        })
    return containers


def _services():
    if not IS_WINDOWS:
        return []
    try:
        out = []
        for svc in psutil.win_service_iter():
            try:
                info = svc.as_dict()
                raw = (info.get("status") or "").lower()
                start_type = (info.get("start_type") or "").lower()
                status = ("active"   if raw == "running" else
                          "failed"   if raw == "failed"  else
                          "inactive" if raw              else "unknown")
                if status in ("active", "failed") or start_type in ("automatic", "automatic (delayed start)"):
                    out.append({
                        "name":         info.get("name") or info.get("display_name") or "?",
                        "display_name": info.get("display_name") or info.get("name") or "?",
                        "status":       status,
                        "start_type":   start_type,
                    })
            except Exception:
                continue
        return out
    except Exception:
        return []


def _security():
    global _security_log_warned
    failed_logins = 0

    try:
        conns = psutil.net_connections(kind="tcp")
        open_ports = sorted({
            int(c.laddr.port)
            for c in conns
            if getattr(c, "status", "") == "LISTEN" and getattr(c, "laddr", None)
        })
        active_ssh = sum(
            1 for c in conns
            if getattr(c, "status", "") == "ESTABLISHED"
            and getattr(c, "raddr", None)
            and getattr(c.raddr, "port", None) == 22
        )
    except Exception:
        open_ports = []
        active_ssh = 0

    # Real failed-login count from Windows Security log (EventID 4625).
    # Requires membership in "Event Log Readers" group or Administrator rights.
    # The Task Scheduler task runs with /RL LIMITED so this may return 0 silently
    # on locked-down systems — check agent log at DEBUG level for access errors.
    if IS_WINDOWS:
        r = _run([
            "powershell", "-NoProfile", "-NonInteractive", "-Command",
            "(Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; "
            "StartTime=(Get-Date).AddDays(-1)} -ErrorAction SilentlyContinue "
            "| Measure-Object).Count",
        ], timeout=8)
        if r and r.returncode == 0:
            try:
                failed_logins = int(r.stdout.strip())
            except Exception:
                pass
        else:
            # Permission failure on Security log — warn once, then debug to avoid log spam
            if not _security_log_warned:
                logger.warning(
                    "failed_logins_24h unavailable (returncode=%s) – "
                    "grant 'Event Log Readers' group or run as Administrator",
                    r.returncode if r else "no result",
                )
                _security_log_warned = True
            else:
                logger.debug("failed_logins query failed (permission denied, warning already emitted)")

    return {
        "open_ports":          open_ports,
        "active_ssh_sessions": active_ssh,
        "failed_logins_24h":   failed_logins,
    }


def _temperatures():
    try:
        data = psutil.sensors_temperatures()
        if not data:
            return []
        out = []
        for sensor, entries in data.items():
            for e in entries:
                out.append({
                    "sensor":   sensor,
                    "label":    e.label or "",
                    "current":  e.current,
                    "high":     e.high,
                    "critical": e.critical,
                })
        return out
    except Exception:
        return []


def _recent_logs():
    logs: dict[str, list] = {"system": [], "auth": [], "error": []}
    if not IS_WINDOWS:
        return logs

    def _query_ps(log_name: str, count: int = 50) -> list:
        # Set console encoding explicitly to avoid mojibake in subprocess stdout
        ps_script = (
            "[Console]::OutputEncoding = [Text.Encoding]::UTF8;"
            "$OutputEncoding = [Text.Encoding]::UTF8;"
            "$ErrorActionPreference='Stop';"
            f"$events = Get-WinEvent -LogName '{log_name}' -MaxEvents {count} "
            "| Select-Object "
            "@{Name='TimeCreated';Expression={$_.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss')}},"
            "ProviderName,Id,LevelDisplayName,Message;"
            "$json = $events | ConvertTo-Json -Compress -Depth 4;"
            "$bytes = [System.Text.Encoding]::UTF8.GetBytes($json);"
            "[System.Convert]::ToBase64String($bytes)"
        )
        r = _run([
            "powershell.exe", "-NoProfile", "-NonInteractive",
            "-ExecutionPolicy", "Bypass", "-Command", ps_script,
        ], timeout=18)
        if not r or r.returncode != 0 or not r.stdout:
            logger.warning("PowerShell log fetch failed for %s: %s",
                           log_name, r.returncode if r else "no result")
            return []

        payload_b64 = str(r.stdout or "").strip()
        if not payload_b64:
            return []

        try:
            decoded = base64.b64decode(payload_b64)
            data = json.loads(decoded.decode("utf-8", errors="replace"))
            events = data if isinstance(data, list) else [data]
        except Exception as e:
            logger.warning("PowerShell log parse error for %s: %s", log_name, e)
            return []

        def fix_date(ts: str) -> str:
            m = re.match(r"/Date\((\d+)\)/", ts)
            if m:
                try:
                    dt = datetime.datetime.utcfromtimestamp(int(m.group(1)) / 1000)
                    return dt.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    return ts
            return ts

        def maybe_fix_mojibake(s: str) -> str:
            text = str(s or "")
            # PowerShell encoding is now forced to UTF-8 at the script level,
            # so most strings arrive clean. Skip the heuristic if no replacement chars.
            if "�" not in text:
                return text

            def score(candidate: str) -> int:
                good = sum(1 for ch in candidate
                           if ch.isalpha() or ch.isdigit() or ch in " .,:;!?-_/()[]{}")
                bad = candidate.count("�")
                return good - bad

            candidates = [text]
            for src, dst in [("cp1251", "cp866"), ("cp866", "cp1251"),
                             ("latin1", "cp1251"), ("latin1", "cp866")]:
                try:
                    candidates.append(text.encode(src, errors="ignore").decode(dst, errors="ignore"))
                except Exception:
                    continue
            return max(candidates, key=score)

        def clean_text(s) -> str:
            s = maybe_fix_mojibake(str(s or ""))
            s = s.replace("\r", " ").replace("\n", " ")
            s = re.sub(r"[\x00-\x1F\x7F]+", " ", s)
            return re.sub(r"\s+", " ", s).strip()

        items = []
        for i, ev in enumerate(events):
            if not isinstance(ev, dict):
                continue
            ts       = fix_date(str(ev.get("TimeCreated") or ""))
            provider = clean_text(ev.get("ProviderName") or "?")
            event_id = clean_text(ev.get("Id") or "?")
            level    = clean_text(ev.get("LevelDisplayName") or "?")
            message  = clean_text(ev.get("Message") or "")
            items.append(
                f"Event[{i}] | Log Name: {log_name} | Source: {provider} | "
                f"Id: {event_id} | Level: {level} | Date: {ts} | Message: {message}"
            )
        return items[:count]

    def _query_wevtutil(log_name: str, count: int = 50) -> list:
        r = _run(["wevtutil", "qe", log_name, f"/c:{count}", "/rd:true", "/f:text"], timeout=12)
        if not r or r.returncode != 0 or not r.stdout:
            logger.warning("wevtutil log fetch failed for %s: %s",
                           log_name, r.returncode if r else "no result")
            return []
        items = []
        for chunk in [c.strip() for c in r.stdout.split("\r\n\r\n") if c.strip()]:
            lines = [ln.strip() for ln in chunk.splitlines() if ln.strip()]
            if lines:
                items.append(" | ".join(lines)[:2000])
        return items[:count]

    logs["system"] = _query_ps("System",      50) or _query_wevtutil("System",      50) or []
    logs["error"]  = _query_ps("Application", 50) or _query_wevtutil("Application", 50) or []

    auth_sources = [
        "Security",
        "Microsoft-Windows-Winlogon/Operational",
        "Microsoft-Windows-TerminalServices-LocalSessionManager/Operational",
        "Microsoft-Windows-User Profile Service/Operational",
    ]
    auth_items: list[str] = []
    for src in auth_sources:
        auth_items.extend(_query_ps(src, 30) or _query_wevtutil(src, 30) or [])

    if not auth_items:
        auth_keywords = (
            "logon", "login", "sign-in", "signin", "security", "audit", "credential",
            "authentication", "authorize", "failed", "denied", "ntlm", "kerberos", "4624", "4625",
        )
        for line in (logs.get("system") or []) + (logs.get("error") or []):
            if any(k in str(line).lower() for k in auth_keywords):
                auth_items.append(line)

    seen: set[str] = set()
    unique_auth: list[str] = []
    for line in auth_items:
        key = str(line).strip()
        if key and key not in seen:
            seen.add(key)
            unique_auth.append(key)

    logs["auth"] = unique_auth[:50]
    for k in ("system", "auth", "error"):
        if not isinstance(logs.get(k), list):
            logs[k] = []
    return logs


def _virtual_machines():
    vms: list[dict] = []
    try:
        if IS_WINDOWS:
            try:
                result = _run([
                    "powershell", "-NoProfile", "-NonInteractive", "-Command",
                    "Get-VM | Select-Object Name, State | ConvertTo-Json -Compress",
                ], timeout=10)
                if result and result.returncode == 0 and result.stdout.strip():
                    data = json.loads(result.stdout)
                    if isinstance(data, dict):
                        data = [data]
                    _state_map = {
                        2: "Running", 3: "Off", 6: "Paused", 9: "Saved",
                        10: "Starting", 11: "Stopping",
                        32768: "RunningCritical", 32769: "OffCritical", 32770: "StoppingCritical",
                    }
                    for vm in data:
                        raw = vm.get("State")
                        state = (_state_map.get(raw, f"State_{raw}") if isinstance(raw, int)
                                 else str(raw) if raw else "unknown")
                        vms.append({"name": vm.get("Name", "?"), "state": state, "type": "Hyper-V"})
            except Exception:
                pass

        vbox_cmds = ["VBoxManage"]
        if IS_WINDOWS:
            vbox_cmds += [
                r"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe",
                r"C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe",
            ]
        for vbox_cmd in vbox_cmds:
            r_all = _run([vbox_cmd, "list", "vms"], timeout=8)
            if not (r_all and r_all.returncode == 0 and r_all.stdout):
                continue
            running: set[str] = set()
            r_run = _run([vbox_cmd, "list", "runningvms"], timeout=8)
            if r_run and r_run.returncode == 0 and r_run.stdout:
                for line in r_run.stdout.splitlines():
                    if line.strip():
                        running.add(line.split("{")[0].strip().strip('"'))
            for line in r_all.stdout.splitlines():
                if line.strip():
                    name = line.split("{")[0].strip().strip('"')
                    vms.append({"name": name, "type": "VirtualBox",
                                "state": "running" if name in running else "off"})
            break

        vmrun_cmds = ["vmrun"]
        if IS_WINDOWS:
            vmrun_cmds += [
                r"C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe",
                r"C:\Program Files\VMware\VMware Workstation\vmrun.exe",
            ]
        vmx_running: set[str] = set()
        for vmrun_cmd in vmrun_cmds:
            r = _run([vmrun_cmd, "list"], timeout=8)
            if r and r.returncode == 0 and r.stdout:
                for line in r.stdout.splitlines():
                    if line.lower().endswith(".vmx"):
                        vmx_running.add(line.strip())
                break

        vmware_all: dict[str, str] = {}
        if IS_WINDOWS:
            for inv in [
                os.path.join(os.environ.get("APPDATA",      ""), "VMware", "inventory.vmls"),
                os.path.join(os.environ.get("LOCALAPPDATA", ""), "VMware", "inventory.vmls"),
            ]:
                if not os.path.exists(inv):
                    continue
                try:
                    with open(inv, encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                    for m in re.finditer(r'config\d+\.\d+\s*=\s*"([^"]+\.vmx)"',
                                         content, re.IGNORECASE):
                        vmx = m.group(1).replace("/", os.sep)
                        vmware_all[vmx] = os.path.splitext(os.path.basename(vmx))[0]
                except Exception:
                    pass
                break

        added: set[str] = set()
        for vmx, name in vmware_all.items():
            is_run = any(vmx.lower() in r.lower() or r.lower() in vmx.lower()
                         for r in vmx_running)
            vms.append({"name": name, "type": "VMware",
                        "state": "running" if is_run else "off"})
            added.add(vmx.lower())
        for vmx in vmx_running:
            if vmx.lower() not in added:
                name = os.path.splitext(os.path.basename(vmx.replace("/", os.sep)))[0]
                vms.append({"name": name, "type": "VMware", "state": "running"})

    except Exception:
        pass
    return vms


# ─── TTL-кэш для медленных операций ─────────────────────────────────────────

def _cached(key: str, ttl: float, fn):
    """Thread-safe TTL cache with anti-thundering-herd (one thread computes, others wait)."""
    now = time.time()
    with _cache_lock:
        entry = _cache.get(key)
        if entry and (now - entry[0]) < ttl:
            return entry[1]
        if key in _in_flight:
            evt = _in_flight[key]
        else:
            evt = threading.Event()
            _in_flight[key] = evt
            evt = None
    if evt is not None:
        evt.wait(timeout=ttl)
        with _cache_lock:
            entry = _cache.get(key)
        return entry[1] if entry else fn()
    try:
        result = fn()
        with _cache_lock:
            _cache[key] = (time.time(), result)
        return result
    finally:
        with _cache_lock:
            ev = _in_flight.pop(key, None)
        if ev:
            ev.set()


def _docker_cached():
    return _cached("docker",           max(INTERVAL, 60),  _docker)

def _virtual_machines_cached():
    return _cached("virtual_machines", max(INTERVAL, 120), _virtual_machines)

def _services_cached():
    return _cached("services",         max(INTERVAL, 60),  _services)

def _security_cached():
    return _cached("security",         max(INTERVAL, 60),  _security)

def _recent_logs_cached():
    return _cached("recent_logs",      max(INTERVAL, 120), _recent_logs)

def _temperatures_cached():
    return _cached("temperatures",     max(INTERVAL, 120), _temperatures)


# ────────────────────────────────────────────────────────────────────────────
# Основной цикл
# ────────────────────────────────────────────────────────────────────────────

async def send_metrics(client, prev_net, prev_nic, prev_dio, prev_ts):
    global _warmup_done, _last_send_ms

    t_start = time.time()
    now = t_start
    dt  = max(now - prev_ts, 0.1)
    loop = asyncio.get_event_loop()

    # Fast synchronous collectors
    cpu_detail  = _cpu()
    ram_detail  = _ram()
    swap_detail = _swap()
    disks       = _disks()
    cur_dio, dio_info = _disk_io(prev_dio, dt)
    cur_net, cur_nic, net_in, net_out, interfaces, connections = _network(prev_net, prev_nic, dt)
    sys_info    = _sys_info()
    procs       = _processes()
    battery     = _battery()
    la1, la5, la15 = _load_avg(cpu_detail["percent"], cpu_detail["cores_logical"])

    # Slow collectors — concurrent in bounded thread pool
    (docker, services, security, recent_logs, temperatures, virtual_machines) = await asyncio.gather(
        loop.run_in_executor(_executor, _docker_cached),
        loop.run_in_executor(_executor, _services_cached),
        loop.run_in_executor(_executor, _security_cached),
        loop.run_in_executor(_executor, _recent_logs_cached),
        loop.run_in_executor(_executor, _temperatures_cached),
        loop.run_in_executor(_executor, _virtual_machines_cached),
    )

    # Use max disk percent across all mounts, not just the first
    disk_pct = max((d["percent"] for d in disks), default=0)

    # Flip warmup flag now — data is reliable from this collection onward.
    # Decoupled from POST success so a failed first send doesn't keep tagging
    # subsequent payloads (which have good CPU data) as warmup.
    was_warmup = not _warmup_done
    _warmup_done = True

    try:
        self_mem_mb = round(psutil.Process().memory_info().rss / 1048576, 1)
    except Exception:
        self_mem_mb = 0.0

    payload = {
        "service":       "agent",
        "agent_version": AGENT_VER,
        "timestamp":     int(now),
        "server_id":     SERVER_ID,
        "metric":        "system",
        "status":        "ok",
        "warmup":        was_warmup,
        "metrics": {
            "cpu":          {"value": cpu_detail["percent"],    "unit": "%"},
            "ram":          {"value": ram_detail["percent"],    "unit": "%"},
            "disk":         {"value": disk_pct,                 "unit": "%"},
            "swap":         {"value": swap_detail["percent"],   "unit": "%"},
            "net_in":       {"value": net_in,                   "unit": "Mbps"},
            "net_out":      {"value": net_out,                  "unit": "Mbps"},
            "load1":        {"value": round(la1, 2),            "unit": ""},
            "load5":        {"value": round(la5, 2),            "unit": ""},
            "load15":       {"value": round(la15, 2),           "unit": ""},
            "processes":    {"value": procs["total"],            "unit": ""},
            "uptime_hours": {"value": sys_info["uptime_hours"], "unit": "ч"},
            "iops_read":    {"value": dio_info["iops_read"],    "unit": "IO/s"},
            "iops_write":   {"value": dio_info["iops_write"],   "unit": "IO/s"},
        },
        "system_info":         sys_info,
        "cpu_detail":          cpu_detail,
        "ram_detail":          ram_detail,
        "swap_detail":         swap_detail,
        "disks":               disks,
        "disk_io":             dio_info,
        "network_interfaces":  interfaces,
        "network_connections": connections,
        "processes_detail":    procs,
        "services":            services           if services           is not None else [],
        "docker_containers":   docker             if docker             is not None else [],
        "virtual_machines":    virtual_machines   if virtual_machines   is not None else [],
        "recent_logs":         recent_logs        if recent_logs        is not None
                               else {"system": [], "auth": [], "error": []},
        "security":            security           if security           is not None
                               else {"open_ports": [], "active_ssh_sessions": 0, "failed_logins_24h": 0},
        "temperatures":        temperatures       if temperatures       is not None else [],
        "battery":             battery,
        "agent_self": {
            "pid":          os.getpid(),
            "memory_mb":    self_mem_mb,
            "last_send_ms": round(_last_send_ms, 0),
            "buffer_len":   len(_send_buffer),
        },
    }

    headers = {}
    if INGEST_KEY:
        headers["X-Ingest-Key"] = INGEST_KEY

    # Flush at most 1 buffered payload per cycle to avoid bursting 26 requests
    # at once after a backend outage (which would likely trigger rate-limiting).
    if _send_buffer:
        try:
            resp = await client.post(
                f"{BACKEND_URL}/api/metrics",
                json=_send_buffer[0],
                headers=headers,
                timeout=15,
            )
            if 200 <= resp.status_code < 300:
                _send_buffer.popleft()
                logger.info("flushed 1 buffered payload (%d remaining)", len(_send_buffer))
        except Exception:
            pass  # will retry next cycle

    # Send current payload
    try:
        resp = await client.post(
            f"{BACKEND_URL}/api/metrics",
            json=payload,
            headers=headers,
            timeout=15,
        )
        if 200 <= resp.status_code < 300:
            logger.info("sent  server=%s cpu=%.1f%% ram=%.1f%% status=%d",
                        SERVER_ID, cpu_detail["percent"], ram_detail["percent"], resp.status_code)
            _write_heartbeat({"ts": int(now), "pid": os.getpid(), "ok": True})
        else:
            if len(_send_buffer) == _send_buffer.maxlen:
                logger.warning("send buffer full (%d) – oldest payload dropped", _send_buffer.maxlen)
            _send_buffer.append(payload)
            logger.warning("post failed server=%s status=%d (buffered=%d)",
                           SERVER_ID, resp.status_code, len(_send_buffer))
    except Exception as exc:
        if len(_send_buffer) == _send_buffer.maxlen:
            logger.warning("send buffer full (%d) – oldest payload dropped", _send_buffer.maxlen)
        _send_buffer.append(payload)
        logger.warning("post error: %s (buffered=%d)", exc, len(_send_buffer))

    _last_send_ms = (time.time() - t_start) * 1000
    return cur_net, cur_nic, cur_dio, now


async def main_loop():
    # Warm up system-level cpu_percent (first call always returns 0)
    psutil.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None, percpu=True)

    # Warm up per-process cpu_percent so the first cycle shows real deltas.
    # psutil caches per-PID baselines; without this the first top-CPU list is all zeros.
    try:
        for p in psutil.process_iter(["pid"]):
            try:
                p.cpu_percent(interval=None)
            except Exception:
                pass
    except Exception:
        pass

    prev_net = psutil.net_io_counters()
    prev_nic = psutil.net_io_counters(pernic=True)
    try:
        prev_dio = psutil.disk_io_counters()
    except Exception:
        prev_dio = None
    prev_ts = time.time()

    transport = httpx.AsyncHTTPTransport(retries=2)
    async with httpx.AsyncClient(transport=transport) as client:
        while not _shutdown.is_set():
            try:
                prev_net, prev_nic, prev_dio, prev_ts = await send_metrics(
                    client, prev_net, prev_nic, prev_dio, prev_ts
                )
            except Exception as exc:
                logger.error("loop error: %s", exc)
            # Interruptible sleep — wakes every 0.5 s to check shutdown.
            # On Windows, Task Scheduler uses TerminateProcess() which bypasses
            # SIGTERM handlers, so we also poll the .agent_paused flag file here
            # as the reliable Windows shutdown mechanism (set by the GUI stop button).
            elapsed = 0.0
            while elapsed < INTERVAL and not _shutdown.is_set():
                if IS_WINDOWS and _is_paused():
                    logger.info("pause flag detected – stopping agent")
                    _shutdown.set()
                    break
                await asyncio.sleep(0.5)
                elapsed += 0.5

    logger.info("main_loop exited cleanly")
    _executor.shutdown(wait=False)


def _handle_signal(signum, frame):
    logger.info("signal %s received – shutting down gracefully", signum)
    _shutdown.set()


if __name__ == "__main__":
    if _raw_server != SERVER_ID:
        logger.warning("SERVER_ID sanitized: %r -> %r (only [a-zA-Z0-9_-.] allowed)",
                       _raw_server, SERVER_ID)
    if not INGEST_KEY:
        logger.warning("INGEST_API_KEY not set – metrics sent without authentication")

    if BACKEND_URL.startswith("http://") and not ALLOW_INSECURE_BACKEND:
        if not BACKEND_URL.startswith("http://127.0.0.1") and not BACKEND_URL.startswith("http://localhost"):
            logger.warning(
                "Backend URL is insecure (http://). Set ALLOW_INSECURE_BACKEND=1 only for local development."
            )

    logger.info(
        "agent v%s  backend=%s  server_id=%s  interval=%ds  os=%s",
        AGENT_VER, BACKEND_URL, SERVER_ID, INTERVAL, platform.system(),
    )

    if _is_paused() and not FORCE_START:
        logger.info("agent paused by GUI flag, exiting")
        raise SystemExit(0)

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _handle_signal)
        except (ValueError, OSError):
            pass

    try:
        asyncio.run(main_loop())
    except KeyboardInterrupt:
        logger.info("agent stopped")
