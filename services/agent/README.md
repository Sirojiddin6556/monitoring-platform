# Monitoring Agent — Инструкция

Агент мониторинга — лёгкий Python-процесс, который устанавливается на каждый наблюдаемый сервер. Он собирает системные метрики через `psutil` и отправляет их на центральный бэкенд по HTTP каждые N секунд.

---

## Содержание

1. [Обзор архитектуры](#обзор-архитектуры)
2. [Собираемые метрики](#собираемые-метрики)
3. [Требования](#требования)
4. [Установка на Linux](#установка-на-linux)
5. [Установка на Windows](#установка-на-windows)
6. [Установка через Docker](#установка-через-docker)
7. [Ручной запуск](#ручной-запуск)
8. [Конфигурация](#конфигурация)
9. [Управление агентом](#управление-агентом)
10. [Протокол обмена данными](#протокол-обмена-данными)
11. [Опциональные модули](#опциональные-модули)
12. [Устранение неполадок](#устранение-неполадок)

---

## Обзор архитектуры

```
┌──────────────────┐         HTTP POST /api/metrics          ┌──────────────────┐
│   Сервер (Linux   │  ────────────────────────────────────►  │   Backend        │
│   или Windows)    │        каждые 15 сек (настраив.)       │   FastAPI        │
│                   │                                         │   :8000          │
│   ┌────────────┐  │                                         │                  │
│   │ agent.py   │  │   ◄── Prometheus /metrics (опц.)       │   ┌───────────┐  │
│   │ psutil     │  │                                         │   │ Dashboard │  │
│   │ httpx      │  │                                         │   │ Next.js   │  │
│   │ docker SDK │  │                                         │   │ :3000     │  │
│   └────────────┘  │                                         │   └───────────┘  │
└──────────────────┘                                         └──────────────────┘
```

**Принцип работы:**
1. Агент запускается как фоновый процесс (systemd / Task Scheduler / Docker)
2. Каждые `INTERVAL` секунд собирает все метрики через psutil
3. Формирует JSON-payload и отправляет POST на `BACKEND_URL/api/metrics`
4. Бэкенд сохраняет данные, проверяет пороги и создаёт алерты
5. Дашборд отображает все данные в реальном времени через WebSocket

---

## Собираемые метрики

### 🔧 1. Системные ресурсы
| Метрика | Описание | Единица |
|---------|----------|---------|
| CPU % | Общая загрузка процессора | % |
| CPU per core | Загрузка каждого ядра | % |
| CPU user/system/idle/iowait | Разбивка по типам | % |
| CPU частота | Текущая / мин / макс | MHz |
| Context switches | Переключения контекста | шт |
| Interrupts | Аппаратные прерывания | шт |
| RAM total/used/free/available | Объём памяти | GB |
| RAM cached/buffers | Кэш и буферы | GB |
| RAM % | Процент использования | % |
| Swap total/used/free/% | Подкачка | GB / % |
| Disk per-partition | Каждый раздел: total/used/free/% | GB / % |
| Disk I/O | Скорость чтения/записи | MB/s |
| IOPS read/write | Операций ввода-вывода в секунду | IO/s |
| Disk latency | Задержка чтения/записи | мс |
| Network per-interface | Скорость In/Out на каждом интерфейсе | Mbps |
| Network packets | Отправлено/получено пакетов | шт |
| Network errors/drops | Ошибки и потери на интерфейсах | шт |
| TCP connections | Количество по состояниям (ESTABLISHED, TIME_WAIT и т.д.) | шт |

### 🖥️ 2. Состояние системы
| Метрика | Описание |
|---------|----------|
| OS | Операционная система и версия |
| Kernel | Версия ядра |
| Hostname | Имя хоста |
| Architecture | Архитектура (x86_64, arm64) |
| Python version | Версия Python на сервере |
| Boot time | Время последней загрузки |
| Uptime | Время работы (часы) |
| Temperature | Температура датчиков (Linux) |

### ⚙️ 3. Процессы и сервисы
| Метрика | Описание |
|---------|----------|
| Processes total | Общее количество процессов |
| Zombie count | Количество zombie-процессов |
| Top 10 by CPU | Процессы с наибольшим CPU (pid, name, cpu%, ram_mb, user) |
| Top 10 by RAM | Процессы с наибольшим потреблением RAM |
| Services status | Статус стандартных сервисов (nginx, docker, postgres, redis и др.) |

**Отслеживаемые сервисы:**
- Web: `nginx`, `apache2`, `httpd`
- Контейнеры: `docker`, `dockerd`, `containerd`
- Базы данных: `postgres`, `mysql`, `mariadb`, `mongodb`
- Кэш/очереди: `redis`, `rabbitmq`
- Безопасность: `sshd`, `fail2ban`, `ufw`, `firewalld`

### 🐳 4. Docker-контейнеры
| Метрика | Описание |
|---------|----------|
| Container list | Все контейнеры (включая остановленные) |
| Container status | running / exited / paused |
| CPU % | Загрузка CPU контейнером |
| Memory MB / % | Потребление RAM контейнером |
| Restarts | Количество перезапусков |
| Image | Используемый образ |

> Требует установленного модуля `docker` (`pip install docker`) и запущенного Docker daemon.

### 📜 5. Логи (Linux)
| Лог | Файлы |
|-----|-------|
| System | `/var/log/syslog`, `/var/log/messages` |
| Auth/Security | `/var/log/auth.log`, `/var/log/secure` |
| Error/Kernel | `/var/log/kern.log` |

Собираются последние 30 строк из каждого лог-файла. Требуются права на чтение.

### 🔐 6. Безопасность
| Метрика | Описание |
|---------|----------|
| Open ports | Список портов в состоянии LISTEN |
| SSH sessions | Количество активных SSH-сессий |
| Failed logins (24h) | Неудачные попытки входа за последние 24 часа |

---

## Требования

| Компонент | Минимум | Рекомендуемый |
|-----------|---------|---------------|
| Python | 3.8+ | 3.11+ |
| RAM | 30 MB | 50 MB |
| Disk | 20 MB | 50 MB |
| Сеть | Доступ к бэкенду по HTTP | — |

**Обязательные Python-пакеты:**
- `psutil>=5.9.0` — сбор метрик  
- `httpx>=0.24.0` — отправка на бэкенд  

**Опциональные пакеты:**
- `docker>=6.0.0` — мониторинг Docker-контейнеров
- `prometheus_client>=0.17.0` — экспорт метрик в Prometheus
- `python-json-logger>=2.0.7` — JSON-формат логов агента

---

## Установка на Linux

### Автоматическая (рекомендуемая)

```bash
# Скачать и запустить установщик
curl -sSL http://<backend_ip>:8000/agent/install.sh | bash -s -- \
    --backend http://<backend_ip>:8000 \
    --server-id my-server-1 \
    --interval 15
```

Или скопировать `install.sh` на сервер и запустить:

```bash
chmod +x install.sh
./install.sh --backend http://10.0.0.1:8000 --server-id web-server-1
```

**Параметры `install.sh`:**

| Параметр | Описание | По умолчанию |
|----------|----------|------------|
| `--backend` | URL бэкенда | — (обязательный) |
| `--server-id` | Уникальный ID сервера | — (обязательный) |
| `--interval` | Интервал отправки (секунды) | `15` |
| `--install-dir` | Каталог установки | `/opt/monitoring-agent` |

**Что делает установщик:**
1. Проверяет/устанавливает Python 3
2. Создаёт виртуальное окружение в `/opt/monitoring-agent/venv`
3. Устанавливает зависимости (psutil, httpx)
4. Записывает `agent.py` и `.env`
5. Создаёт systemd-сервис `monitoring-agent`
6. Включает автозагрузку и запускает агент

### Структура после установки

```
/opt/monitoring-agent/
├── agent.py          # Основной скрипт агента
├── .env              # Конфигурация (BACKEND_URL, SERVER_ID и т.д.)
└── venv/             # Python виртуальное окружение
```

---

## Установка на Windows

### Автоматическая (PowerShell)

Запустить PowerShell **от имени администратора**:

```powershell
.\install.ps1 -BackendUrl "http://172.16.121.28:8000" -ServerId "win-server-1"
```

С дополнительными параметрами:

```powershell
.\install.ps1 -BackendUrl "http://172.16.121.28:8000" -ServerId "win-server-1" -Interval 30 -InstallDir "D:\monitoring"
```

**Параметры `install.ps1`:**

| Параметр | Описание | По умолчанию |
|----------|----------|------------|
| `-BackendUrl` | URL бэкенда | запросит интерактивно |
| `-ServerId` | Уникальный ID сервера | запросит интерактивно |
| `-Interval` | Интервал отправки | `15` |
| `-InstallDir` | Каталог установки | `C:\monitoring-agent` |
| `-ServiceName` | Имя задачи в Планировщике | `MonitoringAgent` |

**Что делает установщик:**
1. Проверяет наличие Python 3
2. Создаёт каталог и виртуальное окружение
3. Устанавливает зависимости
4. Записывает `agent.py`, `.env`, `start.ps1`, `start.bat`
5. Создаёт задачу в Планировщике задач Windows (автозапуск при старте)
6. Запускает агент

### Структура после установки

```
C:\monitoring-agent\
├── agent.py          # Основной скрипт агента
├── .env              # Конфигурация
├── start.ps1         # PowerShell скрипт запуска
├── start.bat         # BAT скрипт запуска
└── venv\             # Python виртуальное окружение
```

---

## Установка через Docker

```bash
docker build -t monitoring-agent ./services/agent

docker run -d \
  --name monitoring-agent \
  --restart always \
  -e BACKEND_URL=http://10.0.0.1:8000 \
  -e SERVER_ID=docker-host-1 \
  -e INTERVAL=15 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  monitoring-agent
```

> `/var/run/docker.sock` нужен для мониторинга Docker-контейнеров.  
> Для Prometheus добавьте `-p 8001:8001`.

**Docker Compose:**

```yaml
services:
  agent:
    build: ./services/agent
    restart: always
    environment:
      BACKEND_URL: http://backend:8000
      SERVER_ID: docker-host-1
      INTERVAL: 15
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

---

## Ручной запуск

Если автоматическая установка не подходит:

```bash
# 1. Создать окружение
python3 -m venv /opt/monitoring-agent/venv
source /opt/monitoring-agent/venv/bin/activate

# 2. Установить зависимости
pip install psutil httpx
pip install docker prometheus_client python-json-logger  # опционально

# 3. Скопировать agent.py (полная версия из services/agent/app.py)
cp services/agent/app.py /opt/monitoring-agent/agent.py

# 4. Задать переменные окружения и запустить
export BACKEND_URL=http://10.0.0.1:8000
export SERVER_ID=my-server-1
export INTERVAL=15
python /opt/monitoring-agent/agent.py
```

Windows (PowerShell):

```powershell
$env:BACKEND_URL = "http://10.0.0.1:8000"
$env:SERVER_ID = "win-server-1"
$env:INTERVAL = "15"
python agent.py
```

---

## Конфигурация

Все параметры настраиваются через **переменные окружения** или файл `.env`:

| Переменная | Описание | По умолчанию |
|------------|----------|------------|
| `BACKEND_URL` | URL бэкенда для отправки метрик | `http://127.0.0.1:8000` |
| `SERVER_ID` | Уникальный идентификатор сервера | `srv-1` |
| `INTERVAL` | Интервал сбора и отправки метрик (секунды) | `15` |
| `METRICS_PORT` | Порт для Prometheus (если установлен) | `8001` |

**Пример `.env` файла:**

```env
BACKEND_URL=http://192.168.1.100:8000
SERVER_ID=web-prod-01
INTERVAL=10
METRICS_PORT=8001
```

### Выбор SERVER_ID

`SERVER_ID` должен совпадать с ID сервера, добавленного через дашборд. Рекомендуемый формат:
- `web-prod-01` — тип-среда-номер
- `db-staging-1`
- `docker-host-main`

> **Важно:** SERVER_ID должен быть уникальным для каждого сервера и совпадать с ID в системе мониторинга.

---

## Управление агентом

### Linux (systemd)

```bash
# Статус
sudo systemctl status monitoring-agent

# Логи (в реальном времени)
sudo journalctl -u monitoring-agent -f

# Перезапуск
sudo systemctl restart monitoring-agent

# Остановка
sudo systemctl stop monitoring-agent

# Отключить автозагрузку
sudo systemctl disable monitoring-agent

# Удалить полностью
sudo systemctl stop monitoring-agent
sudo systemctl disable monitoring-agent
sudo rm /etc/systemd/system/monitoring-agent.service
sudo systemctl daemon-reload
sudo rm -rf /opt/monitoring-agent
```

### Windows (Task Scheduler)

```powershell
# Статус задачи
Get-ScheduledTask -TaskName MonitoringAgent

# Запустить
Start-ScheduledTask -TaskName MonitoringAgent

# Остановить
Stop-ScheduledTask -TaskName MonitoringAgent

# Удалить задачу
Unregister-ScheduledTask -TaskName MonitoringAgent -Confirm:$false

# Удалить файлы
Remove-Item -Recurse -Force C:\monitoring-agent

# Ручной запуск (для отладки)
powershell -File "C:\monitoring-agent\start.ps1"
```

### Docker

```bash
# Логи
docker logs -f monitoring-agent

# Перезапуск
docker restart monitoring-agent

# Остановить и удалить
docker stop monitoring-agent
docker rm monitoring-agent
```

---

## Протокол обмена данными

Агент отправляет `POST /api/metrics` с JSON-телом:

```json
{
  "service": "agent",
  "timestamp": 1711878600,
  "server_id": "web-prod-01",
  "metric": "system",
  "status": "ok",
  
  "metrics": {
    "cpu":          {"value": 45.2,  "unit": "%"},
    "ram":          {"value": 68.1,  "unit": "%"},
    "disk":         {"value": 55.0,  "unit": "%"},
    "swap":         {"value": 12.3,  "unit": "%"},
    "net_in":       {"value": 1.25,  "unit": "Mbps"},
    "net_out":      {"value": 0.87,  "unit": "Mbps"},
    "load1":        {"value": 1.24,  "unit": ""},
    "load5":        {"value": 1.10,  "unit": ""},
    "load15":       {"value": 0.98,  "unit": ""},
    "processes":    {"value": 245,   "unit": ""},
    "uptime_hours": {"value": 720.5, "unit": "ч"},
    "iops_read":    {"value": 150,   "unit": "IO/s"},
    "iops_write":   {"value": 85,    "unit": "IO/s"}
  },
  
  "system_info":          { ... },
  "cpu_detail":           { ... },
  "ram_detail":           { ... },
  "swap_detail":          { ... },
  "disks":                [ ... ],
  "disk_io":              { ... },
  "network_interfaces":   [ ... ],
  "network_connections":  { ... },
  "temperatures":         [ ... ],
  "processes_detail":     { ... },
  "services":             [ ... ],
  "docker_containers":    [ ... ] | null,
  "recent_logs":          { ... },
  "security":             { ... }
}
```

**Ответ бэкенда:**
- `200 OK` — метрики приняты
- `422` — невалидный payload

Агент логирует результат каждой отправки. При ошибке повторяет на следующем интервале.

---

## Опциональные модули

### Prometheus

Если установлен `prometheus_client`, агент экспортирует метрики:

```
http://<server_ip>:8001/metrics
```

Пример конфига `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'monitoring-agents'
    static_configs:
      - targets:
        - 'server1:8001'
        - 'server2:8001'
```

### Docker SDK

Для мониторинга Docker-контейнеров:

```bash
pip install docker
```

Агент автоматически обнаружит Docker daemon и начнёт собирать статистику контейнеров. Если Docker не установлен или daemon не запущен — секция `docker_containers` будет `null` (не вызывает ошибок).

### JSON-логирование

```bash
pip install python-json-logger
```

Логи агента будут в формате JSON (удобно для ELK / Loki / Splunk):

```json
{"asctime": "2026-03-31 12:00:15", "name": "agent", "levelname": "INFO", "message": "metrics sent server_id=web-01 cpu=45.2 ram=68.1 status=200"}
```

---

## Устранение неполадок

### Агент не может подключиться к бэкенду

```
WARNING failed to post metrics: ConnectError
```

**Решение:**
1. Проверьте доступность бэкенда: `curl http://<backend_ip>:8000/api/ping`
2. Проверьте firewall: порт 8000 должен быть открыт
3. Убедитесь, что `BACKEND_URL` указан правильно (с `http://`)

### Метрики пустые на дашборде

1. Проверьте, что `SERVER_ID` агента совпадает с ID сервера в дашборде
2. Убедитесь, что сервер добавлен через UI (страница «Серверы» → «Добавить»)
3. Проверьте логи агента: `journalctl -u monitoring-agent -f`

### Docker-метрики не приходят

1. Проверьте: `docker ps` — работает ли Docker?
2. Проверьте доступ к сокету: `ls -la /var/run/docker.sock`
3. Установлен ли модуль: `pip show docker`
4. При запуске через Docker — подключён ли `-v /var/run/docker.sock:/var/run/docker.sock`?

### Логи не собираются

- Логи собираются **только на Linux**
- Агенту нужны **права на чтение** `/var/log/syslog`, `/var/log/auth.log` и т.д.
- Запуск от root или добавление пользователя в группу `adm`:
  ```bash
  sudo usermod -aG adm $(whoami)
  ```

### Высокое потребление CPU агентом

Увеличьте `INTERVAL` (например, до 30 или 60 секунд):

```bash
# Изменить в .env
echo "INTERVAL=30" >> /opt/monitoring-agent/.env
sudo systemctl restart monitoring-agent
```

### Permission denied (psutil)

На Linux некоторые метрики (TCP connections, процессы других пользователей) требуют root. Рекомендуется запускать от root или с `CAP_NET_ADMIN`:

```bash
# Дать capability для чтения соединений
sudo setcap cap_net_admin,cap_net_raw+ep /opt/monitoring-agent/venv/bin/python3
```

### Ошибка «No module named 'psutil'»

```bash
# Активируйте venv
source /opt/monitoring-agent/venv/bin/activate
pip install psutil httpx
```

---

## Безопасность

- Агент отправляет данные **только исходящими** HTTP-запросами — входящих подключений не требуется (кроме опционального Prometheus-порта)
- На файерволе достаточно разрешить **исходящий** трафик на порт бэкенда
- Файл `.env` содержит конфигурацию — ограничьте доступ: `chmod 600 /opt/monitoring-agent/.env`
- При использовании Prometheus ограничьте доступ к порту 8001 (только для Prometheus-сервера)

---

## Обновление агента

### Linux

```bash
# Остановить
sudo systemctl stop monitoring-agent

# Заменить файл
cp new_agent.py /opt/monitoring-agent/agent.py

# Обновить зависимости (при необходимости)
/opt/monitoring-agent/venv/bin/pip install --upgrade psutil httpx docker

# Запустить
sudo systemctl start monitoring-agent
```

### Windows

```powershell
Stop-ScheduledTask -TaskName MonitoringAgent
Copy-Item new_agent.py C:\monitoring-agent\agent.py -Force
Start-ScheduledTask -TaskName MonitoringAgent
```

### Docker

```bash
docker stop monitoring-agent
docker rm monitoring-agent
docker build -t monitoring-agent ./services/agent
# Запустить заново с теми же параметрами
```
