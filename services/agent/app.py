import os
import asyncio
import httpx
import time
import psutil
import platform
import socket
import datetime
import subprocess
import json
import logging

try:
    from prometheus_client import Counter, start_http_server
    HAS_PROMETHEUS = True
except ImportError:
    HAS_PROMETHEUS = False

try:
    from pythonjsonlogger import jsonlogger
    HAS_JSON_LOGGER = True
except ImportError:
    HAS_JSON_LOGGER = False

try:
    import docker
    HAS_DOCKER = True
except ImportError:
    HAS_DOCKER = False

BACKEND_URL = os.getenv('BACKEND_URL', 'http://127.0.0.1:8000')
METRICS_PORT = int(os.getenv('METRICS_PORT', '8001'))
SERVER_ID = os.getenv('SERVER_ID', 'srv-1')
INTERVAL = int(os.getenv('INTERVAL', '15'))

# Prometheus
if HAS_PROMETHEUS:
    SENT_METRICS = Counter('agent_sent_metrics_total', 'Metrics sent')

# Logger
logger = logging.getLogger('agent')
handler = logging.StreamHandler()
if HAS_JSON_LOGGER:
    handler.setFormatter(jsonlogger.JsonFormatter('%(asctime)s %(name)s %(levelname)s %(message)s'))
else:
    handler.setFormatter(logging.Formatter('%(asctime)s %(name)s %(levelname)s %(message)s'))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

IS_LINUX = platform.system().lower() == 'linux'
IS_WINDOWS = platform.system().lower() == 'windows'


# ============================================================
# 1. СИСТЕМНЫЕ РЕСУРСЫ
# ============================================================

def collect_cpu_detail():
    """CPU: общий %, per-core, user/system/idle, частоты, ядра"""
    cpu_pct = psutil.cpu_percent(interval=None)
    per_core = psutil.cpu_percent(interval=None, percpu=True)
    times = psutil.cpu_times_percent(interval=None)
    cores_phys = psutil.cpu_count(logical=False) or 0
    cores_logic = psutil.cpu_count(logical=True) or 0
    freq = psutil.cpu_freq()
    try:
        ctx = psutil.cpu_stats()
        ctx_switches = ctx.ctx_switches
        interrupts = ctx.interrupts
    except Exception:
        ctx_switches = 0
        interrupts = 0
    return {
        'percent': round(cpu_pct, 1),
        'per_core': [round(c, 1) for c in (per_core or [])],
        'user': round(getattr(times, 'user', 0), 1),
        'system': round(getattr(times, 'system', 0), 1),
        'idle': round(getattr(times, 'idle', 0), 1),
        'iowait': round(getattr(times, 'iowait', 0), 1) if hasattr(times, 'iowait') else 0,
        'cores_physical': cores_phys,
        'cores_logical': cores_logic,
        'freq_current': round(freq.current, 0) if freq else 0,
        'freq_min': round(freq.min, 0) if freq and freq.min else 0,
        'freq_max': round(freq.max, 0) if freq and freq.max else 0,
        'ctx_switches': ctx_switches,
        'interrupts': interrupts,
    }


def collect_ram_detail():
    """RAM: total, used, free, available, cached, buffers, percent"""
    mem = psutil.virtual_memory()
    return {
        'total_gb': round(mem.total / 1073741824, 2),
        'used_gb': round(mem.used / 1073741824, 2),
        'free_gb': round((mem.total - mem.used) / 1073741824, 2),
        'available_gb': round(mem.available / 1073741824, 2),
        'cached_gb': round(getattr(mem, 'cached', 0) / 1073741824, 2),
        'buffers_gb': round(getattr(mem, 'buffers', 0) / 1073741824, 2),
        'percent': round(mem.percent, 1),
    }


def collect_swap_detail():
    """Swap: total, used, free, percent"""
    sw = psutil.swap_memory()
    return {
        'total_gb': round(sw.total / 1073741824, 2),
        'used_gb': round(sw.used / 1073741824, 2),
        'free_gb': round(sw.free / 1073741824, 2),
        'percent': round(sw.percent, 1),
    }


def collect_disks():
    """Диски: per-partition usage + I/O counters"""
    partitions = []
    for p in psutil.disk_partitions(all=False):
        try:
            u = psutil.disk_usage(p.mountpoint)
            partitions.append({
                'device': p.device,
                'mountpoint': p.mountpoint,
                'fstype': p.fstype,
                'total_gb': round(u.total / 1073741824, 2),
                'used_gb': round(u.used / 1073741824, 2),
                'free_gb': round(u.free / 1073741824, 2),
                'percent': round(u.percent, 1),
            })
        except (PermissionError, OSError):
            continue
    return partitions


def collect_network_interfaces(prev_per_nic, dt):
    """Сеть: per-interface скорость, ошибки, drops"""
    cur = psutil.net_io_counters(pernic=True)
    interfaces = []
    for name, c in cur.items():
        if name.startswith(('lo', 'Loopback')):
            continue
        prev = prev_per_nic.get(name)
        if prev and dt > 0.1:
            speed_in = round((c.bytes_recv - prev.bytes_recv) * 8 / dt / 1_000_000, 3)
            speed_out = round((c.bytes_sent - prev.bytes_sent) * 8 / dt / 1_000_000, 3)
        else:
            speed_in = 0
            speed_out = 0
        interfaces.append({
            'name': name,
            'bytes_sent': c.bytes_sent,
            'bytes_recv': c.bytes_recv,
            'speed_in_mbps': max(0, speed_in),
            'speed_out_mbps': max(0, speed_out),
            'packets_sent': c.packets_sent,
            'packets_recv': c.packets_recv,
            'errors_in': c.errin,
            'errors_out': c.errout,
            'drops_in': c.dropin,
            'drops_out': c.dropout,
        })
    return interfaces, cur


def collect_network_connections():
    """Количество TCP-соединений по состоянию"""
    try:
        conns = psutil.net_connections(kind='tcp')
        stats = {}
        for c in conns:
            st = c.status
            stats[st] = stats.get(st, 0) + 1
        return {'total': len(conns), 'by_status': stats}
    except (psutil.AccessDenied, OSError):
        return {'total': 0, 'by_status': {}}


# ============================================================
# 2. СОСТОЯНИЕ СИСТЕМЫ
# ============================================================

def collect_system_info():
    """OS, kernel, hostname, архитектура, boot time"""
    boot = psutil.boot_time()
    boot_dt = datetime.datetime.fromtimestamp(boot).strftime('%Y-%m-%d %H:%M:%S')
    uptime_hours = round((time.time() - boot) / 3600, 1)
    uname = platform.uname()
    return {
        'os': f"{uname.system} {uname.release}",
        'os_version': uname.version,
        'kernel': uname.release,
        'hostname': socket.gethostname(),
        'architecture': uname.machine,
        'python_version': platform.python_version(),
        'boot_time': boot_dt,
        'uptime_hours': uptime_hours,
    }


def collect_temperatures():
    """Температуры (Linux only)"""
    temps = []
    try:
        sensors = psutil.sensors_temperatures()
        if sensors:
            for chip, entries in sensors.items():
                for e in entries:
                    temps.append({
                        'label': e.label or chip,
                        'current': round(e.current, 1),
                        'high': round(e.high, 1) if e.high else None,
                        'critical': round(e.critical, 1) if e.critical else None,
                    })
    except (AttributeError, Exception):
        pass
    return temps


# ============================================================
# 3. ПРОЦЕССЫ И СЕРВИСЫ
# ============================================================

def collect_top_processes(top_n=10):
    """Top процессы по CPU и RAM, zombie count"""
    procs = []
    zombie_count = 0
    for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_info', 'status', 'username']):
        try:
            info = p.info
            if info['status'] == 'zombie':
                zombie_count += 1
            mem_mb = round(info['memory_info'].rss / 1048576, 1) if info.get('memory_info') else 0
            procs.append({
                'pid': info['pid'],
                'name': info['name'] or '?',
                'cpu': round(info.get('cpu_percent', 0) or 0, 1),
                'ram_mb': mem_mb,
                'status': info['status'],
                'user': info.get('username', ''),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    by_cpu = sorted(procs, key=lambda x: x['cpu'], reverse=True)[:top_n]
    by_ram = sorted(procs, key=lambda x: x['ram_mb'], reverse=True)[:top_n]
    return {
        'total': len(procs),
        'zombie': zombie_count,
        'top_cpu': by_cpu,
        'top_ram': by_ram,
    }


COMMON_SERVICES = [
    'nginx', 'apache2', 'httpd',
    'docker', 'dockerd', 'containerd',
    'postgres', 'postgresql', 'mysqld', 'mariadb',
    'redis-server', 'redis',
    'rabbitmq-server', 'rabbitmq',
    'mongodb', 'mongod',
    'sshd', 'ssh',
    'fail2ban',
    'ufw', 'firewalld',
]


def collect_services():
    """Проверить статус известных сервисов"""
    services = []
    if IS_LINUX:
        for svc in COMMON_SERVICES:
            try:
                result = subprocess.run(
                    ['systemctl', 'is-active', svc],
                    capture_output=True, text=True, timeout=3
                )
                status = result.stdout.strip()
                if status in ('active', 'inactive', 'failed'):
                    services.append({'name': svc, 'status': status})
            except Exception:
                continue
    elif IS_WINDOWS:
        win_services = ['W3SVC', 'MSSQLSERVER', 'MySQL', 'postgresql-x64-14',
                        'Redis', 'docker', 'sshd', 'RabbitMQ']
        for svc in win_services:
            try:
                result = subprocess.run(
                    ['sc', 'query', svc],
                    capture_output=True, text=True, timeout=3
                )
                if 'RUNNING' in result.stdout:
                    services.append({'name': svc, 'status': 'active'})
                elif 'STOPPED' in result.stdout:
                    services.append({'name': svc, 'status': 'inactive'})
            except Exception:
                continue
    # Also check by process name
    running_names = set()
    for p in psutil.process_iter(['name']):
        try:
            running_names.add(p.info['name'].lower())
        except Exception:
            continue
    service_names_found = {s['name'] for s in services}
    for svc in COMMON_SERVICES:
        if svc not in service_names_found:
            if svc.lower() in running_names or svc.replace('-', '').lower() in running_names:
                services.append({'name': svc, 'status': 'active'})
    return services


# ============================================================
# 4. DOCKER КОНТЕЙНЕРЫ
# ============================================================

def collect_docker():
    """Docker: список контейнеров, статус, CPU/RAM"""
    if not HAS_DOCKER:
        return None
    try:
        client = docker.from_env(timeout=5)
        client.ping()
    except Exception:
        return None
    containers = []
    try:
        for c in client.containers.list(all=True):
            info = {
                'id': c.short_id,
                'name': c.name,
                'image': str(c.image.tags[0]) if c.image.tags else str(c.image.short_id),
                'status': c.status,
                'state': c.attrs.get('State', {}).get('Status', c.status),
                'restarts': c.attrs.get('RestartCount', 0),
                'created': c.attrs.get('Created', ''),
            }
            if c.status == 'running':
                try:
                    stats = c.stats(stream=False)
                    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - stats['precpu_stats']['cpu_usage']['total_usage']
                    sys_delta = stats['cpu_stats']['system_cpu_usage'] - stats['precpu_stats']['system_cpu_usage']
                    n_cpus = stats['cpu_stats'].get('online_cpus', 1) or 1
                    cpu_pct = round((cpu_delta / sys_delta) * n_cpus * 100, 2) if sys_delta > 0 else 0
                    mem_usage = stats['memory_stats'].get('usage', 0)
                    mem_limit = stats['memory_stats'].get('limit', 1)
                    info['cpu_percent'] = cpu_pct
                    info['mem_mb'] = round(mem_usage / 1048576, 1)
                    info['mem_percent'] = round(mem_usage / mem_limit * 100, 2) if mem_limit > 0 else 0
                except Exception:
                    info['cpu_percent'] = 0
                    info['mem_mb'] = 0
                    info['mem_percent'] = 0
            else:
                info['cpu_percent'] = 0
                info['mem_mb'] = 0
                info['mem_percent'] = 0
            containers.append(info)
    except Exception:
        pass
    return containers


# ============================================================
# 6a. ВИРТУАЛЬНЫЕ МАШИНЫ (Hyper-V / VirtualBox)
# ============================================================

def collect_virtual_machines():
    """Собирает список ВМ с хоста (Hyper-V на Windows, VBoxManage если установлен)"""
    vms = []
    is_windows = platform.system().lower() == 'windows'

    # Hyper-V (Windows)
    if is_windows:
        try:
            ps_cmd = (
                'Get-VM | Select-Object Name,State,CPUUsage,MemoryAssigned,'
                'MemoryDemand,MemoryStartup,Uptime,Status,Version,'
                'ProcessorCount,DynamicMemoryEnabled,'
                '@{N="DiskGB";E={[math]::Round(($_ | Get-VMHardDiskDrive | '
                'Get-VHD -ErrorAction SilentlyContinue | '
                'Measure-Object FileSize -Sum).Sum/1GB,1)}} '
                '| ConvertTo-Json -Compress'
            )
            result = subprocess.run(
                ['powershell', '-NoProfile', '-Command', ps_cmd],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout.strip())
                if isinstance(data, dict):
                    data = [data]
                for vm in data:
                    state_raw = vm.get('State', 0)
                    # Hyper-V State enum: 2=Running, 3=Off, 6=Saved, 9=Paused
                    state_map = {2: 'running', 3: 'stopped', 6: 'saved', 9: 'paused', 32768: 'paused'}
                    state_str = state_map.get(state_raw, str(state_raw))
                    
                    mem_assigned = vm.get('MemoryAssigned', 0) or 0
                    mem_startup = vm.get('MemoryStartup', 0) or 0
                    
                    uptime_raw = vm.get('Uptime')
                    uptime_sec = 0
                    if isinstance(uptime_raw, dict):
                        uptime_sec = (uptime_raw.get('Days', 0) * 86400 +
                                      uptime_raw.get('Hours', 0) * 3600 +
                                      uptime_raw.get('Minutes', 0) * 60 +
                                      uptime_raw.get('Seconds', 0))
                    elif isinstance(uptime_raw, (int, float)):
                        uptime_sec = int(uptime_raw)
                    
                    vms.append({
                        'name': vm.get('Name', ''),
                        'state': state_str,
                        'cpu_count': vm.get('ProcessorCount', 0),
                        'cpu_usage': vm.get('CPUUsage', 0),
                        'ram_mb': round(mem_assigned / 1048576) if mem_assigned else 0,
                        'ram_startup_mb': round(mem_startup / 1048576) if mem_startup else 0,
                        'ram_demand_mb': round((vm.get('MemoryDemand', 0) or 0) / 1048576),
                        'dynamic_memory': vm.get('DynamicMemoryEnabled', False),
                        'disk_gb': vm.get('DiskGB', 0) or 0,
                        'uptime': uptime_sec,
                        'status': vm.get('Status', ''),
                        'version': vm.get('Version', ''),
                        'type': 'hyperv',
                    })
        except Exception:
            pass

    # VBoxManage (cross-platform)
    try:
        result = subprocess.run(
            ['VBoxManage', 'list', 'vms'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().splitlines():
                parts = line.rsplit('{', 1)
                if len(parts) == 2:
                    vm_name = parts[0].strip().strip('"')
                    vm_uuid = parts[1].strip().rstrip('}')
                    info = {'name': vm_name, 'vmid': vm_uuid, 'state': 'unknown',
                            'cpu_count': 0, 'ram_mb': 0, 'type': 'virtualbox'}
                    try:
                        info_result = subprocess.run(
                            ['VBoxManage', 'showvminfo', vm_uuid, '--machinereadable'],
                            capture_output=True, text=True, timeout=10
                        )
                        if info_result.returncode == 0:
                            for l in info_result.stdout.splitlines():
                                if l.startswith('VMState='):
                                    raw = l.split('=', 1)[1].strip('"')
                                    smap = {'running': 'running', 'poweroff': 'stopped',
                                            'saved': 'saved', 'paused': 'paused', 'aborted': 'stopped'}
                                    info['state'] = smap.get(raw, raw)
                                elif l.startswith('cpus='):
                                    info['cpu_count'] = int(l.split('=', 1)[1].strip('"'))
                                elif l.startswith('memory='):
                                    info['ram_mb'] = int(l.split('=', 1)[1].strip('"'))
                    except Exception:
                        pass
                    vms.append(info)
    except FileNotFoundError:
        pass
    except Exception:
        pass

    return vms if vms else None


# ============================================================
# 7. ЛОГИ (последние записи)
# ============================================================

def collect_recent_logs(max_lines=30):
    """Читает последние строки из системных логов (Linux)"""
    logs = {'system': [], 'auth': [], 'error': []}
    if not IS_LINUX:
        return logs
    log_files = {
        'system': ['/var/log/syslog', '/var/log/messages'],
        'auth': ['/var/log/auth.log', '/var/log/secure'],
        'error': ['/var/log/kern.log'],
    }
    for category, paths in log_files.items():
        for path in paths:
            try:
                with open(path, 'r', errors='replace') as f:
                    lines = f.readlines()[-max_lines:]
                    logs[category] = [l.strip() for l in lines if l.strip()]
                break
            except (PermissionError, FileNotFoundError):
                continue
    return logs


# ============================================================
# 8. БЕЗОПАСНОСТЬ
# ============================================================

def collect_security():
    """Открытые порты, SSH-сессии, failed login attempts"""
    security = {
        'open_ports': [],
        'active_ssh_sessions': 0,
        'failed_logins_24h': 0,
    }
    # Open listening ports
    try:
        conns = psutil.net_connections(kind='tcp')
        listening = set()
        for c in conns:
            if c.status == 'LISTEN' and c.laddr:
                listening.add(c.laddr.port)
        security['open_ports'] = sorted(listening)
    except (psutil.AccessDenied, OSError):
        pass
    # SSH sessions
    try:
        users = psutil.users()
        security['active_ssh_sessions'] = sum(1 for u in users if 'pts' in (u.terminal or '') or 'ssh' in (u.host or '').lower())
    except Exception:
        pass
    # Failed login attempts (Linux auth.log)
    if IS_LINUX:
        for log_path in ['/var/log/auth.log', '/var/log/secure']:
            try:
                count = 0
                cutoff = time.time() - 86400
                with open(log_path, 'r', errors='replace') as f:
                    for line in f:
                        if 'Failed password' in line or 'authentication failure' in line:
                            count += 1
                security['failed_logins_24h'] = count
                break
            except (PermissionError, FileNotFoundError):
                continue
    return security


# ============================================================
# ОСНОВНАЯ ОТПРАВКА МЕТРИК
# ============================================================

async def send_metric(client, prev_net_total, prev_dio, prev_per_nic, prev_time):
    """Собрать ВСЕ метрики и отправить на бэкенд"""
    now = time.time()
    dt = now - prev_time
    if dt < 0.1:
        dt = 1.0

    # 1. CPU
    cpu_detail = collect_cpu_detail()

    # 2. RAM
    ram_detail = collect_ram_detail()
    swap_detail = collect_swap_detail()

    # 3. Disk
    disks = collect_disks()
    main_disk_pct = disks[0]['percent'] if disks else 0

    # Disk IO speed
    try:
        cur_dio = psutil.disk_io_counters()
        if prev_dio and cur_dio:
            iops_r = round((cur_dio.read_count - prev_dio.read_count) / dt, 0)
            iops_w = round((cur_dio.write_count - prev_dio.write_count) / dt, 0)
            read_mb_s = round((cur_dio.read_bytes - prev_dio.read_bytes) / dt / 1048576, 2)
            write_mb_s = round((cur_dio.write_bytes - prev_dio.write_bytes) / dt / 1048576, 2)
            # Disk latency (avg ms per op)
            rd_count = cur_dio.read_count - prev_dio.read_count
            wd_count = cur_dio.write_count - prev_dio.write_count
            rd_time_ms = cur_dio.read_time - prev_dio.read_time
            wd_time_ms = cur_dio.write_time - prev_dio.write_time
            read_latency = round(rd_time_ms / rd_count, 2) if rd_count > 0 else 0
            write_latency = round(wd_time_ms / wd_count, 2) if wd_count > 0 else 0
        else:
            iops_r = iops_w = read_mb_s = write_mb_s = 0
            read_latency = write_latency = 0
    except Exception:
        cur_dio = None
        iops_r = iops_w = read_mb_s = write_mb_s = 0
        read_latency = write_latency = 0

    # 4. Network
    cur_net_total = psutil.net_io_counters()
    net_in_mbps = round((cur_net_total.bytes_recv - prev_net_total.bytes_recv) * 8 / dt / 1_000_000, 3) if dt > 0.1 else 0
    net_out_mbps = round((cur_net_total.bytes_sent - prev_net_total.bytes_sent) * 8 / dt / 1_000_000, 3) if dt > 0.1 else 0
    interfaces, cur_per_nic = collect_network_interfaces(prev_per_nic, dt)
    connections = collect_network_connections()

    # Load average
    try:
        la = psutil.getloadavg()
        load1, load5, load15 = la[0], la[1], la[2]
    except (AttributeError, OSError):
        load1 = load5 = load15 = cpu_detail['percent'] / 100.0 * cpu_detail['cores_logical']

    # 2. System info
    sys_info = collect_system_info()

    # Temperature
    temperatures = collect_temperatures()

    # 3. Processes & Services
    processes = collect_top_processes()
    services = collect_services()

    # 4. Docker
    docker_containers = collect_docker()

    # 5. Virtual Machines
    virtual_machines = collect_virtual_machines()

    # 7. Recent logs
    recent_logs = collect_recent_logs()

    # 8. Security
    security = collect_security()

    # ── Build payload ──
    payload = {
        'service': 'agent',
        'timestamp': int(now),
        'server_id': SERVER_ID,
        'metric': 'system',
        # Основные метрики (backward-compatible)
        'metrics': {
            'cpu':          {'value': cpu_detail['percent'],      'unit': '%'},
            'ram':          {'value': ram_detail['percent'],       'unit': '%'},
            'disk':         {'value': main_disk_pct,              'unit': '%'},
            'swap':         {'value': swap_detail['percent'],     'unit': '%'},
            'net_in':       {'value': max(0, net_in_mbps),        'unit': 'Mbps'},
            'net_out':      {'value': max(0, net_out_mbps),       'unit': 'Mbps'},
            'load1':        {'value': round(load1, 2),            'unit': ''},
            'load5':        {'value': round(load5, 2),            'unit': ''},
            'load15':       {'value': round(load15, 2),           'unit': ''},
            'processes':    {'value': processes['total'],          'unit': ''},
            'uptime_hours': {'value': sys_info['uptime_hours'],   'unit': 'ч'},
            'iops_read':    {'value': max(0, iops_r),             'unit': 'IO/s'},
            'iops_write':   {'value': max(0, iops_w),             'unit': 'IO/s'},
        },
        # Расширенные секции
        'system_info': sys_info,
        'cpu_detail': cpu_detail,
        'ram_detail': ram_detail,
        'swap_detail': swap_detail,
        'disks': disks,
        'disk_io': {
            'read_mb_s': max(0, read_mb_s),
            'write_mb_s': max(0, write_mb_s),
            'iops_read': max(0, iops_r),
            'iops_write': max(0, iops_w),
            'read_latency_ms': max(0, read_latency),
            'write_latency_ms': max(0, write_latency),
        },
        'network_interfaces': interfaces,
        'network_connections': connections,
        'temperatures': temperatures,
        'processes_detail': processes,
        'services': services,
        'docker_containers': docker_containers,
        'virtual_machines': virtual_machines,
        'recent_logs': recent_logs,
        'security': security,
        'status': 'ok',
    }

    try:
        resp = await client.post(f"{BACKEND_URL}/api/metrics", json=payload, timeout=15)
        if HAS_PROMETHEUS:
            SENT_METRICS.inc()
        logger.info('metrics sent server_id=%s cpu=%.1f ram=%.1f status=%d',
                     SERVER_ID, cpu_detail['percent'], ram_detail['percent'], resp.status_code)
    except Exception as e:
        logger.warning('failed to post metrics: %s', str(e))

    return cur_net_total, cur_dio, cur_per_nic, now


async def loop():
    if HAS_PROMETHEUS:
        try:
            start_http_server(METRICS_PORT)
        except Exception:
            pass
    # Init cpu_percent (first call always 0)
    psutil.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None, percpu=True)
    prev_net = psutil.net_io_counters()
    prev_per_nic = psutil.net_io_counters(pernic=True)
    try:
        prev_dio = psutil.disk_io_counters()
    except Exception:
        prev_dio = None
    prev_time = time.time()

    async with httpx.AsyncClient() as client:
        while True:
            try:
                prev_net, prev_dio, prev_per_nic, prev_time = await send_metric(
                    client, prev_net, prev_dio, prev_per_nic, prev_time
                )
            except Exception as e:
                logger.error('loop error: %s', str(e))
            await asyncio.sleep(INTERVAL)


if __name__ == '__main__':
    logger.info('agent starting backend=%s server_id=%s interval=%d platform=%s docker=%s',
                BACKEND_URL, SERVER_ID, INTERVAL, platform.system(), HAS_DOCKER)
    try:
        asyncio.run(loop())
    except KeyboardInterrupt:
        logger.info('agent stopping')
