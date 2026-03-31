"""
Remote metrics collection via SSH (Linux) and WinRM (Windows).
Collects CPU, RAM, disk, network, processes, uptime without installing agents.
"""

import asyncio
import logging
import time

logger = logging.getLogger(__name__)


# ========== SSH Collector (Linux/Unix) ==========

async def collect_via_ssh(host: str, user: str, port: int = 22,
                          password: str = None, key_path: str = None) -> dict:
    """Collect metrics from a remote Linux server via SSH."""
    try:
        import asyncssh
    except ImportError:
        logger.error("asyncssh not installed. Run: pip install asyncssh")
        return _error_result("asyncssh not installed")

    connect_kwargs = {
        'host': host,
        'port': port,
        'username': user,
        'known_hosts': None,  # Accept any host key for monitoring
    }
    if key_path:
        connect_kwargs['client_keys'] = [key_path]
    if password:
        connect_kwargs['password'] = password

    try:
        async with asyncssh.connect(**connect_kwargs) as conn:
            # Run all metric commands in parallel
            cmds = {
                'cpu': "grep 'cpu ' /proc/stat",
                'cpu_count': "nproc",
                'loadavg': "cat /proc/loadavg",
                'meminfo': "cat /proc/meminfo",
                'disk': "df -B1 --total 2>/dev/null | tail -1",
                'disk_detail': "df -BM --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs 2>/dev/null || df -h",
                'uptime': "cat /proc/uptime",
                'hostname': "hostname",
                'uname': "uname -r",
                'os_release': "cat /etc/os-release 2>/dev/null | head -5",
                'net_dev': "cat /proc/net/dev",
                'processes': "ps aux --no-headers | wc -l",
                'top_procs': "ps aux --sort=-%cpu --no-headers | head -10",
            }
            results = {}
            tasks = []
            for key, cmd in cmds.items():
                tasks.append(_run_ssh_cmd(conn, key, cmd))
            done = await asyncio.gather(*tasks, return_exceptions=True)
            for key, output in done:
                results[key] = output if not isinstance(output, Exception) else ""

            return _parse_linux_metrics(results)
    except asyncssh.PermissionDenied:
        return _error_result("SSH permission denied")
    except asyncssh.ConnectionLost:
        return _error_result("SSH connection lost")
    except OSError as e:
        return _error_result(f"SSH connection failed: {e}")
    except Exception as e:
        logger.exception("SSH collection error")
        return _error_result(str(e))


async def _run_ssh_cmd(conn, key: str, cmd: str):
    """Run a single SSH command and return (key, stdout)."""
    try:
        result = await asyncio.wait_for(conn.run(cmd, check=False), timeout=10)
        return (key, result.stdout.strip() if result.stdout else "")
    except Exception as e:
        return (key, "")


def _parse_linux_metrics(raw: dict) -> dict:
    """Parse raw command outputs into structured metrics."""
    ts = int(time.time())
    metrics = {}

    # CPU from /proc/stat (overall usage approximation)
    try:
        parts = raw.get('cpu', '').split()
        if len(parts) >= 8:
            user, nice, system, idle, iowait = int(parts[1]), int(parts[2]), int(parts[3]), int(parts[4]), int(parts[5])
            total = user + nice + system + idle + iowait
            busy = total - idle
            cpu_pct = round(busy / total * 100, 1) if total > 0 else 0
        else:
            cpu_pct = 0
    except Exception:
        cpu_pct = 0

    try:
        cpu_count = int(raw.get('cpu_count', '1').strip())
    except Exception:
        cpu_count = 1

    # Load average
    load1, load5, load15 = 0.0, 0.0, 0.0
    try:
        lparts = raw.get('loadavg', '').split()
        load1 = float(lparts[0])
        load5 = float(lparts[1])
        load15 = float(lparts[2])
    except Exception:
        pass

    # Memory from /proc/meminfo
    mem_total, mem_avail, mem_free = 0, 0, 0
    swap_total, swap_free = 0, 0
    try:
        for line in raw.get('meminfo', '').splitlines():
            if line.startswith('MemTotal:'):
                mem_total = int(line.split()[1])  # kB
            elif line.startswith('MemAvailable:'):
                mem_avail = int(line.split()[1])
            elif line.startswith('MemFree:'):
                mem_free = int(line.split()[1])
            elif line.startswith('SwapTotal:'):
                swap_total = int(line.split()[1])
            elif line.startswith('SwapFree:'):
                swap_free = int(line.split()[1])
    except Exception:
        pass

    if mem_avail == 0:
        mem_avail = mem_free
    ram_pct = round((1 - mem_avail / mem_total) * 100, 1) if mem_total > 0 else 0
    swap_pct = round((1 - swap_free / swap_total) * 100, 1) if swap_total > 0 else 0

    # Disk usage
    disk_pct = 0
    try:
        dparts = raw.get('disk', '').split()
        if len(dparts) >= 3:
            dtotal = int(dparts[1])
            dused = int(dparts[2])
            disk_pct = round(dused / dtotal * 100, 1) if dtotal > 0 else 0
    except Exception:
        pass

    # Disks detail
    disks = []
    try:
        for line in raw.get('disk_detail', '').splitlines()[1:]:  # skip header
            parts = line.split()
            if len(parts) >= 6 and not parts[0].startswith('tmpfs'):
                disks.append({
                    'device': parts[0],
                    'total': parts[1],
                    'used': parts[2],
                    'free': parts[3],
                    'percent': parts[4],
                    'mountpoint': parts[5],
                })
    except Exception:
        pass

    # Uptime
    uptime_hours = 0
    try:
        uptime_hours = round(float(raw.get('uptime', '0').split()[0]) / 3600, 1)
    except Exception:
        pass

    # Processes count
    try:
        num_procs = int(raw.get('processes', '0').strip())
    except Exception:
        num_procs = 0

    # Network interfaces
    net_interfaces = []
    try:
        for line in raw.get('net_dev', '').splitlines()[2:]:  # skip 2 header lines
            parts = line.split()
            if len(parts) >= 10:
                iface = parts[0].rstrip(':')
                net_interfaces.append({
                    'name': iface,
                    'bytes_recv': int(parts[1]),
                    'bytes_sent': int(parts[9]),
                })
    except Exception:
        pass

    # Top processes
    top_procs = []
    try:
        for line in raw.get('top_procs', '').splitlines():
            parts = line.split(None, 10)
            if len(parts) >= 11:
                top_procs.append({
                    'user': parts[0],
                    'pid': parts[1],
                    'cpu': parts[2],
                    'mem': parts[3],
                    'command': parts[10][:80],
                })
    except Exception:
        pass

    # System info
    hostname = raw.get('hostname', '').strip()
    kernel = raw.get('uname', '').strip()
    os_info = ''
    try:
        for line in raw.get('os_release', '').splitlines():
            if line.startswith('PRETTY_NAME='):
                os_info = line.split('=', 1)[1].strip('"')
                break
    except Exception:
        pass

    metrics = {
        'cpu': {'value': cpu_pct, 'unit': '%'},
        'ram': {'value': ram_pct, 'unit': '%'},
        'disk': {'value': disk_pct, 'unit': '%'},
        'swap': {'value': swap_pct, 'unit': '%'},
        'load1': {'value': load1, 'unit': ''},
        'load5': {'value': load5, 'unit': ''},
        'load15': {'value': load15, 'unit': ''},
        'processes': {'value': num_procs, 'unit': ''},
        'uptime_hours': {'value': uptime_hours, 'unit': 'h'},
        'net_in': {'value': 0, 'unit': 'Mbps'},
        'net_out': {'value': 0, 'unit': 'Mbps'},
        'iops_read': {'value': 0, 'unit': 'IO/s'},
        'iops_write': {'value': 0, 'unit': 'IO/s'},
    }

    extended = {
        'system_info': {
            'hostname': hostname,
            'os': os_info or 'Linux',
            'kernel': kernel,
            'cpu_count': cpu_count,
            'ram_total_gb': round(mem_total / 1024 / 1024, 1),
        },
        'ram_detail': {
            'total_gb': round(mem_total / 1024 / 1024, 1),
            'available_gb': round(mem_avail / 1024 / 1024, 1),
            'used_gb': round((mem_total - mem_avail) / 1024 / 1024, 1),
            'percent': ram_pct,
        },
        'swap_detail': {
            'total_gb': round(swap_total / 1024 / 1024, 1),
            'free_gb': round(swap_free / 1024 / 1024, 1),
            'used_gb': round((swap_total - swap_free) / 1024 / 1024, 1),
            'percent': swap_pct,
        },
        'disks': disks,
        'network_interfaces': net_interfaces,
        'processes_detail': top_procs,
    }

    return {
        'status': 'ok',
        'timestamp': ts,
        'metrics': metrics,
        'source': 'ssh',
        **extended,
    }


# ========== WinRM Collector (Windows) ==========

async def collect_via_winrm(host: str, user: str, password: str,
                            port: int = 5985, use_ssl: bool = False) -> dict:
    """Collect metrics from a remote Windows server via WinRM."""
    try:
        import winrm
    except ImportError:
        logger.error("pywinrm not installed. Run: pip install pywinrm")
        return _error_result("pywinrm not installed")

    # WinRM is synchronous, run in thread pool
    loop = asyncio.get_event_loop()
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(None, _winrm_collect_sync, host, user, password, port, use_ssl),
            timeout=30
        )
    except asyncio.TimeoutError:
        return _error_result("WinRM connection timeout")
    except Exception as e:
        logger.exception("WinRM collection error")
        return _error_result(str(e))


def _winrm_collect_sync(host: str, user: str, password: str,
                        port: int, use_ssl: bool) -> dict:
    """Synchronous WinRM metrics collection."""
    import winrm

    scheme = 'https' if use_ssl else 'http'
    endpoint = f'{scheme}://{host}:{port}/wsman'
    session = winrm.Session(
        endpoint, auth=(user, password),
        transport='ntlm',
        server_cert_validation='ignore' if use_ssl else 'validate',
    )

    ts = int(time.time())

    # PowerShell script to collect all metrics at once
    ps_script = r"""
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ramTotal = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
$ramFree = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
$ramUsed = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1)
$ramPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
$swapTotal = [math]::Round(($os.TotalVirtualMemorySize - $os.TotalVisibleMemorySize) / 1MB, 1)
$swapFree = [math]::Round(($os.FreeVirtualMemory - $os.FreePhysicalMemory) / 1MB, 1)
if($swapFree -lt 0){$swapFree=0}
$swapPct = if($swapTotal -gt 0){[math]::Round(($swapTotal - $swapFree) / $swapTotal * 100, 1)}else{0}
$disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object {
    $pct = if($_.Size -gt 0){[math]::Round(($_.Size - $_.FreeSpace) / $_.Size * 100, 1)}else{0}
    "$($_.DeviceID)|$([math]::Round($_.Size/1GB,1))|$([math]::Round(($_.Size-$_.FreeSpace)/1GB,1))|$([math]::Round($_.FreeSpace/1GB,1))|$pct"
}
$diskTotalSize = (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Measure-Object -Property Size -Sum).Sum
$diskTotalFree = (Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Measure-Object -Property FreeSpace -Sum).Sum
$diskPct = if($diskTotalSize -gt 0){[math]::Round(($diskTotalSize - $diskTotalFree) / $diskTotalSize * 100, 1)}else{0}
$procs = (Get-Process).Count
$uptime = (Get-Date) - $os.LastBootUpTime
$uptimeH = [math]::Round($uptime.TotalHours, 1)
$hostname = $env:COMPUTERNAME
$osCaption = $os.Caption
$cpuInfo = (Get-CimInstance Win32_Processor)[0]
$cpuName = $cpuInfo.Name
$cpuCores = $cpuInfo.NumberOfCores
$cpuLogical = $cpuInfo.NumberOfLogicalProcessors
$nets = Get-CimInstance Win32_NetworkAdapter -Filter "NetConnectionStatus=2" | ForEach-Object {
    $cfg = Get-CimInstance Win32_NetworkAdapterConfiguration -Filter "Index=$($_.Index)"
    "$($_.Name)|$($cfg.IPAddress -join ',')"
}
$topProcs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 | ForEach-Object {
    "$($_.Id)|$($_.ProcessName)|$([math]::Round($_.CPU,1))|$([math]::Round($_.WorkingSet64/1MB,1))"
}
Write-Output "===METRICS==="
Write-Output "CPU=$cpu"
Write-Output "RAM_PCT=$ramPct"
Write-Output "RAM_TOTAL=$ramTotal"
Write-Output "RAM_USED=$ramUsed"
Write-Output "RAM_FREE=$ramFree"
Write-Output "SWAP_PCT=$swapPct"
Write-Output "SWAP_TOTAL=$swapTotal"
Write-Output "SWAP_FREE=$swapFree"
Write-Output "DISK_PCT=$diskPct"
Write-Output "PROCS=$procs"
Write-Output "UPTIME_H=$uptimeH"
Write-Output "HOSTNAME=$hostname"
Write-Output "OS=$osCaption"
Write-Output "CPU_NAME=$cpuName"
Write-Output "CPU_CORES=$cpuCores"
Write-Output "CPU_LOGICAL=$cpuLogical"
Write-Output "===DISKS==="
$disks | ForEach-Object { Write-Output $_ }
Write-Output "===NETS==="
$nets | ForEach-Object { Write-Output $_ }
Write-Output "===PROCS==="
$topProcs | ForEach-Object { Write-Output $_ }
Write-Output "===END==="
"""

    try:
        result = session.run_ps(ps_script)
        if result.status_code != 0:
            stderr = result.std_err.decode('utf-8', errors='ignore') if result.std_err else ''
            return _error_result(f"WinRM PS error: {stderr[:200]}")
        output = result.std_out.decode('utf-8', errors='ignore')
        return _parse_winrm_output(output, ts)
    except Exception as e:
        return _error_result(f"WinRM exec error: {e}")


def _parse_winrm_output(output: str, ts: int) -> dict:
    """Parse the combined PowerShell output."""
    lines = output.strip().splitlines()
    vals = {}
    disks = []
    nets = []
    procs = []
    section = 'metrics'

    for line in lines:
        line = line.strip()
        if line == '===METRICS===':
            section = 'metrics'
            continue
        elif line == '===DISKS===':
            section = 'disks'
            continue
        elif line == '===NETS===':
            section = 'nets'
            continue
        elif line == '===PROCS===':
            section = 'procs'
            continue
        elif line == '===END===':
            break

        if section == 'metrics' and '=' in line:
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip()
        elif section == 'disks' and '|' in line:
            parts = line.split('|')
            if len(parts) >= 5:
                disks.append({
                    'device': parts[0],
                    'total': f"{parts[1]}G",
                    'used': f"{parts[2]}G",
                    'free': f"{parts[3]}G",
                    'percent': f"{parts[4]}%",
                    'mountpoint': parts[0],
                })
        elif section == 'nets' and '|' in line:
            parts = line.split('|')
            nets.append({
                'name': parts[0] if parts else '',
                'addresses': parts[1] if len(parts) > 1 else '',
            })
        elif section == 'procs' and '|' in line:
            parts = line.split('|')
            if len(parts) >= 4:
                procs.append({
                    'pid': parts[0],
                    'command': parts[1],
                    'cpu': parts[2],
                    'mem': parts[3],
                })

    def fval(key, default=0):
        try:
            return float(vals.get(key, default))
        except (ValueError, TypeError):
            return float(default)

    cpu_pct = fval('CPU')
    ram_pct = fval('RAM_PCT')
    disk_pct = fval('DISK_PCT')
    swap_pct = fval('SWAP_PCT')
    num_procs = int(fval('PROCS'))
    uptime_hours = fval('UPTIME_H')

    metrics = {
        'cpu': {'value': cpu_pct, 'unit': '%'},
        'ram': {'value': ram_pct, 'unit': '%'},
        'disk': {'value': disk_pct, 'unit': '%'},
        'swap': {'value': swap_pct, 'unit': '%'},
        'load1': {'value': 0, 'unit': ''},
        'load5': {'value': 0, 'unit': ''},
        'load15': {'value': 0, 'unit': ''},
        'processes': {'value': num_procs, 'unit': ''},
        'uptime_hours': {'value': uptime_hours, 'unit': 'h'},
        'net_in': {'value': 0, 'unit': 'Mbps'},
        'net_out': {'value': 0, 'unit': 'Mbps'},
        'iops_read': {'value': 0, 'unit': 'IO/s'},
        'iops_write': {'value': 0, 'unit': 'IO/s'},
    }

    extended = {
        'system_info': {
            'hostname': vals.get('HOSTNAME', ''),
            'os': vals.get('OS', 'Windows'),
            'cpu_name': vals.get('CPU_NAME', ''),
            'cpu_count': int(fval('CPU_LOGICAL', 1)),
            'cpu_cores': int(fval('CPU_CORES', 1)),
            'ram_total_gb': fval('RAM_TOTAL'),
        },
        'ram_detail': {
            'total_gb': fval('RAM_TOTAL'),
            'used_gb': fval('RAM_USED'),
            'free_gb': fval('RAM_FREE'),
            'percent': ram_pct,
        },
        'swap_detail': {
            'total_gb': fval('SWAP_TOTAL'),
            'free_gb': fval('SWAP_FREE'),
            'percent': swap_pct,
        },
        'disks': disks,
        'network_interfaces': nets,
        'processes_detail': procs,
    }

    return {
        'status': 'ok',
        'timestamp': ts,
        'metrics': metrics,
        'source': 'winrm',
        **extended,
    }


# ========== Dispatcher ==========

async def collect_remote_metrics(server: dict) -> dict:
    """Dispatch to the appropriate collector based on monitor_type."""
    monitor_type = server.get('monitor_type', 'agent')
    host = server.get('host')

    if not host:
        return _error_result("No host configured")

    if monitor_type == 'ssh':
        return await collect_via_ssh(
            host=host,
            user=server.get('ssh_user', 'root'),
            port=server.get('ssh_port', 22),
            password=server.get('ssh_password'),
            key_path=server.get('ssh_key_path'),
        )
    elif monitor_type == 'winrm':
        return await collect_via_winrm(
            host=host,
            user=server.get('winrm_user', 'Administrator'),
            password=server.get('winrm_password', ''),
            port=server.get('winrm_port', 5985),
            use_ssl=server.get('winrm_use_ssl', False),
        )
    else:
        return _error_result(f"Unknown monitor_type: {monitor_type}")


def _error_result(msg: str) -> dict:
    """Return an error structure compatible with the metrics format."""
    return {
        'status': 'error',
        'error': msg,
        'timestamp': int(time.time()),
        'metrics': {
            'cpu': {'value': 0, 'unit': '%'},
            'ram': {'value': 0, 'unit': '%'},
            'disk': {'value': 0, 'unit': '%'},
            'swap': {'value': 0, 'unit': '%'},
            'load1': {'value': 0, 'unit': ''},
            'load5': {'value': 0, 'unit': ''},
            'load15': {'value': 0, 'unit': ''},
            'processes': {'value': 0, 'unit': ''},
            'uptime_hours': {'value': 0, 'unit': 'h'},
            'net_in': {'value': 0, 'unit': 'Mbps'},
            'net_out': {'value': 0, 'unit': 'Mbps'},
            'iops_read': {'value': 0, 'unit': 'IO/s'},
            'iops_write': {'value': 0, 'unit': 'IO/s'},
        },
        'source': 'error',
    }
