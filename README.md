# Monitoring Platform

Полнофункциональная платформа мониторинга инфраструктуры: серверы, веб-сайты, Docker-контейнеры, виртуальные машины, Kubernetes-кластеры и логи — всё в одном интерфейсе.

[![CI](https://github.com/your-org/monitoring/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/monitoring/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.11-blue)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Возможности

| Категория | Что умеет |
|-----------|-----------|
| **Серверы** | CPU, RAM, Disk, Network в реальном времени (WebSocket). Мониторинг через агент, SSH или WinRM |
| **Веб-сайты** | HTTP/HTTPS проверка доступности, код ответа, время отклика, SSL-сертификат |
| **Docker** | Список контейнеров, статус, использование ресурсов |
| **Виртуальные машины** | Hyper-V и VirtualBox через агент |
| **Kubernetes** | Состояние нод и подов, подключение по kubeconfig или токену |
| **Логи** | Сбор и просмотр логов с серверов в реальном времени |
| **Алерты** | Правила по CPU/RAM/статусу, severity: info/warning/critical, авто-снятие |
| **Уведомления** | Telegram-бот, webhook-каналы |
| **Организации** | Мульти-тенантность: каждый клиент видит только свои ресурсы |
| **Prometheus** | Экспорт метрик на `/metrics` для интеграции с Grafana |

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                         Браузер                             │
│              Next.js 14  (порт 3000)                        │
│   WebSocket ──────────────────────────────────────────────► │
└─────────────────────┬───────────────────────────────────────┘
                      │ REST / WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│               FastAPI Backend  (порт 8000)                  │
│  JWT Auth · CORS · Rate Limit · Prometheus · Fernet Encrypt │
└──────┬──────────────┬──────────────────────┬────────────────┘
       │              │                      │
┌──────▼──────┐ ┌─────▼──────┐  ┌───────────▼──────────────┐
│ PostgreSQL  │ │  SSH/WinRM │  │  Kubernetes API          │
│ (основная   │ │  (удалённый│  │  (kube clusters)         │
│  БД)        │ │  мониторинг│  └──────────────────────────┘
└─────────────┘ └────────────┘
┌─────────────────────────────────────────────────────────────┐
│               Агент (на каждом сервере)                     │
│  psutil · Docker CLI · Hyper-V/VirtualBox · логи            │
│  Отправляет метрики каждые 15 сек → POST /api/metrics       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│               Prober (опционально)                          │
│  HTTP(S) проверка веб-сайтов каждые 30 сек → /api/probe    │
└─────────────────────────────────────────────────────────────┘
```

---

## Быстрый старт — Docker Compose

**Требования:** Docker 24+, Docker Compose v2

```bash
# 1. Клонировать репозиторий
git clone https://github.com/your-org/monitoring.git
cd monitoring

# 2. Создать файл с секретами
cp infrastructure/.env.example infrastructure/.env
# Откройте infrastructure/.env и замените все ЗАМЕНИ_НА_... своими значениями

# 3. Запустить
cd infrastructure
docker compose up -d

# 4. Открыть интерфейс
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API docs:  http://localhost:8000/docs  (только dev-режим)
```

При первом запуске автоматически создаётся администратор с email/паролем из `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`.

---

## Конфигурация (.env)

Полный пример с комментариями — [infrastructure/.env.example](infrastructure/.env.example).

| Переменная | Обязательно | Описание |
|-----------|:-----------:|---------|
| `POSTGRES_USER` | ✅ | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | ✅ | Пароль PostgreSQL |
| `POSTGRES_DB` | ✅ | Имя БД |
| `SECRET_KEY` | ✅ | JWT-секрет (64 символа) |
| `FIELD_ENCRYPTION_KEY` | ✅ | Fernet-ключ для шифрования SSH/WinRM паролей в БД |
| `INGEST_API_KEY` | ✅ | Ключ для агентов и пробера (`X-Ingest-Key`). Поддерживаются множественные ключи через `INGEST_API_KEYS` |
| `ALLOWED_ORIGINS` | ✅ | CORS: URL фронтенда через запятую |
| `NEXT_PUBLIC_API_URL` | ✅ | URL бэкенда, видимый браузером (вшивается в сборку) |
| `INITIAL_ADMIN_EMAIL` | ✅ | Email первого администратора |
| `INITIAL_ADMIN_PASSWORD` | ✅ | Пароль первого администратора |
| `AGENT_SERVER_ID` | — | ID сервера для агента в docker-compose |
| `PROBER_TARGET_URL` | — | URL для проверки зондом |

**Генерация ключей:**
```bash
# SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(64))"

# FIELD_ENCRYPTION_KEY
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# INGEST_API_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## Установка агента на сервер

Агент устанавливается **на каждый сервер**, который нужно мониторить. Он собирает CPU, RAM, диск, сеть, процессы, Docker-контейнеры и виртуальные машины.

### Linux (bash)

```bash
curl -sSL http://<backend-ip>:8000/agent/install.sh | bash -s -- \
    --backend http://<backend-ip>:8000 \
    --server-id my-server-01 \
    --agent-key <SERVER_AGENT_KEY>
```

Или скачать и запустить вручную:

```bash
# Скопировать agent/ на сервер, затем:
chmod +x install.sh
./install.sh --backend http://10.0.0.1:8000 --server-id web-01 --agent-key <key> --arch amd64
```

Агент регистрируется как **systemd-сервис** и стартует автоматически при перезагрузке.

```bash
sudo systemctl status monitoring-agent
sudo journalctl -u monitoring-agent -f
```

### Windows (PowerShell)

```powershell
.\install.ps1 -BackendUrl "http://10.0.0.1:8000" -ServerId "win-server-01" -AgentKey "<SERVER_AGENT_KEY>"
```

Агент регистрируется в **Планировщике задач** и запускается при старте системы без окна консоли.

### Desktop GUI (Windows)

```powershell
cd agent
.\build.ps1
.\gui-dist\MonitoringAgentGUI.exe
```

WPF GUI управляет Go-бинарником `MonitoringAgent.exe`: старт/стоп, настройки `agent.env`, heartbeat и логи.

### GUI/CLI-установщик

```powershell
cd agent\installer
go build -trimpath -ldflags "-s -w" -o ..\MonitoringAgentInstaller.exe .
```

Установщик скачивает/копирует Go-бинарник и регистрирует Windows Task Scheduler task.

---

## Локальный запуск (без Docker)

<details>
<summary>Развернуть</summary>

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements-local.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Агент (опционально):**
```bash
cd agent
BACKEND_URL=http://localhost:8000 SERVER_ID=local INGEST_API_KEY=devkey go run .
```

**Prober (опционально):**
```bash
cd services/prober
pip install -r requirements.txt
BACKEND_URL=http://localhost:8000 TARGET_URL=https://example.com INGEST_API_KEY=devkey python prober.py
```

Откройте: http://127.0.0.1:3000

> По умолчанию в dev-режиме используется SQLite (`backend/data/monitoring.db`). PostgreSQL подключается через `DATABASE_URL=postgresql+asyncpg://...`.

</details>

---

## API

Бэкенд работает на FastAPI. Документация Swagger доступна по `/docs` в режиме разработки.

### Аутентификация

```http
POST /api/auth/login
Content-Type: application/json

{"email": "admin@example.com", "password": "..."}
```

Возвращает `{"access_token": "...", "token_type": "bearer"}`. Далее передавать в заголовке:
```
Authorization: Bearer <token>
```

### Ключевые эндпоинты

| Метод | Путь | Описание |
|-------|------|---------|
| `POST` | `/api/auth/login` | Вход, получение JWT |
| `POST` | `/api/auth/register` | Регистрация (admin only) |
| `GET` | `/api/servers` | Список серверов с live-метриками |
| `POST` | `/api/servers` | Добавить сервер |
| `GET` | `/api/websites` | Список сайтов с состоянием |
| `POST` | `/api/websites` | Добавить сайт |
| `GET` | `/api/alerts` | Активные алерты |
| `GET` | `/api/logs` | Логи |
| `POST` | `/api/metrics` | Приём метрик от агента (`X-Ingest-Key`) |
| `POST` | `/api/probe` | Приём результатов пробера (`X-Ingest-Key`) |
| `POST` | `/api/logs` | Приём логов от агента (`X-Ingest-Key`) |
| `GET` | `/api/agent/keys` | Список ключей агентов (admin only) |
| `POST` | `/api/agent/keys` | Создать новый ключ агента (admin only) |
| `POST` | `/api/servers/{server_id}/agent-key` | Создать новый ключ агента для существующего сервера (admin only) |
| `GET` | `/api/servers/{server_id}/agent-keys` | Получить список ключей агента для сервера (admin only) |
| `DELETE` | `/api/servers/{server_id}/agent-keys/{key_id}` | Отключить ключ агента для сервера (admin only) |
| `DELETE` | `/api/agent/keys/{key_id}` | Отключить ключ агента (admin only) |
| `WS` | `/ws` | WebSocket live-обновления |
| `GET` | `/metrics` | Prometheus-метрики |
| `GET` | `/health` | Healthcheck |

### WebSocket

```javascript
const ws = new WebSocket("ws://localhost:8000/ws?token=<JWT>");
// В production используйте wss:// и защищённый JWT-токен.
ws.onmessage = (e) => {
  const { metric } = JSON.parse(e.data);
  // metric.server_id, metric.metrics.cpu_percent, ...
};
```

### Agent key management

Admin может создать уникальный ключ для каждого сервера через `/api/agent/keys`.
Также при создании сервера можно сразу получить ключ, отправив `create_agent_token: true` в тело запроса `/api/servers`.
Агент должен передавать этот ключ в заголовке `X-Ingest-Key` вместе с `server_id` в payload.
Это позволяет ограничивать данные только сервером, которому соответствует ключ.

---

## Роли и права

| Роль | Описание |
|------|---------|
| `admin` | Полный доступ: управление пользователями, организациями, настройками |
| `user` | Полный доступ к мониторингу, создание ресурсов |
| `viewer` | Только чтение (метрики, алерты, логи) |

---

## Структура проекта

```
monitoring/
├── backend/                  # FastAPI + SQLAlchemy async
│   ├── app/
│   │   ├── main.py           # Основное приложение, все роуты
│   │   ├── models.py         # ORM-модели (Server, Website, Alert, ...)
│   │   ├── schemas.py        # Pydantic-схемы
│   │   ├── security.py       # JWT, хэширование паролей
│   │   ├── crypto.py         # Fernet-шифрование чувствительных полей
│   │   ├── db.py             # Async SQLAlchemy + инициализация БД
│   │   └── telegram_bot.py   # Telegram-уведомления
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # Next.js 14 + React + Recharts
│   ├── pages/
│   │   ├── index.js          # Главный дашборд
│   │   ├── servers.js        # Серверы (WebSocket)
│   │   ├── websites.js       # Веб-сайты
│   │   ├── alerts.js         # Алерты
│   │   ├── logs.js           # Логи
│   │   ├── docker.js         # Docker-контейнеры
│   │   ├── kubernetes.js     # Kubernetes-кластеры
│   │   ├── vms.js            # Виртуальные машины
│   │   ├── telegram.js       # Telegram-бот
│   │   ├── notifications.js  # Каналы уведомлений
│   │   ├── organizations.js  # Организации
│   │   └── settings.js       # Настройки
│   ├── components/           # MetricCard, ChartCard, Sidebar, ...
│   ├── lib/api.js            # HTTP-клиент (fetch + auth)
│   ├── next.config.js
│   └── Dockerfile
│
├── agent/                    # Go-агент мониторинга
│   ├── main.go               # Основной цикл и сбор payload
│   ├── collectors*.go        # gopsutil, Docker, VMs, логи
│   ├── install.sh            # CLI-установщик для Linux
│   ├── install.ps1           # CLI-установщик для Windows
│   ├── build.ps1             # Сборка Windows/Linux binaries
│   └── gui/                  # Desktop GUI (WPF)
├── services/
│   └── prober/               # HTTP-зонд
│       ├── prober.py
│       └── requirements.txt
│
└── infrastructure/
    ├── docker-compose.yml    # Сборка всего стека
    └── .env.example          # Шаблон конфигурации
```

---

## Мониторинг типов серверов

| Тип | Как подключить | Что собирает |
|-----|---------------|-------------|
| **Agent** | Установить Go-бинарник из `agent/` на сервер | CPU, RAM, Disk, Network, процессы, Docker, VMs, логи |
| **SSH** | Указать хост + пользователь + ключ/пароль | CPU, RAM, Disk (через `top`, `df`, `free`) |
| **WinRM** | Указать хост + пользователь + пароль | CPU, RAM, Disk (через PowerShell) |

SSH/WinRM пароли хранятся зашифрованными (Fernet) в БД.

---

## CI/CD

GitHub Actions запускает два job при пуше в `main`/`master`:
- **Backend** — `pip install` + `flake8` lint
- **Frontend** — `npm ci` + `npm run build`

Конфигурация: [.github/workflows/ci.yml](.github/workflows/ci.yml)

---

## Troubleshooting

**`asyncpg` ошибка на Windows:**
```bash
pip install -r backend/requirements-local.txt  # использует aiosqlite вместо asyncpg
```

**WebSocket не подключается:**
Проверьте `NEXT_PUBLIC_API_URL` в `frontend/.env.local` — он должен быть адресом бэкенда, видимым из браузера, а не внутри Docker-сети.

**Агент не шлёт метрики:**
```bash
# Проверить .env агента
cat /opt/monitoring-agent/.env

# Логи агента
sudo journalctl -u monitoring-agent -n 50
```

**Порт занят:**
```bash
# Linux
lsof -i :8000 && kill -9 <PID>

# Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Сброс БД (локально):**
```bash
rm backend/data/monitoring.db  # SQLite
```

---

## Лицензия

[MIT](LICENSE)
