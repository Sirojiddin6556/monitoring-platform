# 04. Solution Architect Report — Monitoring Platform Architecture

## 1. Выбранный стек технологий
* **Backend**: FastAPI (Python 3.11) + Uvicorn. Асинхронные сессии SQLAlchemy (PostgreSQL) + кэширование и сессии в Redis.
* **Frontend**: Next.js 14 (Pages Router) + React.
* **Agent**: Go 1.22 (сбор метрик, локальное кэширование, буферизация).
* **Сборка и развертывание**: Docker, Docker Compose, Multi-stage сборка образов.
* **CI/CD**: GitHub Actions (linting, pytest, pre-deployment checks, docker-build).

## 2. Структура проекта и План декомпозиции бэкенда

### 2.1 Текущая структура бэкенда (`backend/app/`):
- `main.py` (200 КБ — содержит регистрацию приложений, логгеры, шедулеры, кэш, роутеры метрик, логов и пробера).
- `routers/` (содержит auth, dashboards, incidents, maintenance, server_configs, sla).

### 2.2 План декомпозиции:
Вынести из `main.py` следующие логические блоки в изолированные роутеры:
1. **`routers/metrics.py`** — Обработка потока метрик агентов (`POST /api/metrics`), запись в БД, оповещение WebSocket-клиентов.
2. **`routers/logs.py`** — Сбор логов от агентов (`POST /api/logs`), чтение исторических логов.
3. **`routers/probes.py`** — Обработка результатов пробера сайтов (`POST /api/probe`).
4. **`routers/websocket.py`** — Маршрутизация WebSocket-клиентов (`/ws`) для стриминга метрик.

После выноса роутеров в `main.py` останется только инициализация приложения FastAPI, CORS, middleware лимитов запросов, запуск Celery-задач и обработчики жизненного цикла (`lifespan`).

---

## 3. Стратегия модульного CSS на фронтенде
Вместо единого `global.css` (24 КБ) вводится следующая структура:
* `styles/global.css` — Сброс стилей (Reset), системные CSS-переменные (Design Tokens) темы `OBSIDIAN INDIGO`, общие макеты (AppShell, Sidebar).
* `components/[ComponentName].module.css` — Стили для изолированных компонентов (например, `Sidebar.module.css`, `TimeRangeFilter.module.css`).
* `styles/pages/[PageName].module.css` — Уникальные стили для конкретных страниц (например, `servers.module.css`, `websites.module.css`), которые импортируются непосредственно в файлы страниц.
  - *Эффект*: Уменьшение размера первой загрузки (First Load CSS) и изоляция стилей.

---

## 4. Архитектурные решения безопасности
* **fail-closed по умолчанию**: API локального воркера и API агента требуют токен авторизации. При отсутствии токена доступ закрыт.
* **Изоляция Tenant**: Каждый SQL-запрос за данными серверов, логов или алертов в обязательном порядке содержит условие `WHERE tenant_id = :tenant_id` (полученный из JWT-токена пользователя).
