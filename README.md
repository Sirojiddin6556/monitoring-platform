# Microservice Monitoring Platform

Полнофункциональная система мониторинга микросервисов с встроенным мониторингом и управлением пользователями.

## 🔐 Аутентификация

Система предоставляет **JWT-based аутентификацию** с управлением пользователями и ролями.

**Дефольтный администратор:**
- Email: `admin@example.com`
- Пароль: `admin123`

**Роли:**
- **admin** — администратор, управление пользователями
- **user** — пользователь, полный доступ к мониторингу
- **viewer** — только чтение

**Подробнее:** [AUTH.md](AUTH.md)

## 🚀 Быстрый старт

### 1) Backend
```bash
cd backend && python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements-local.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 2) Frontend
\\\ash
cd frontend && npm install && npm run dev
\\\

### 3) Агент (опционально)
\\\ash
cd services/agent && python app.py
\\\

### 4) Зонд (опционально)
\\\ash
cd services/prober && python prober.py
\\\

**Откройте:** http://127.0.0.1:3000

## 📁 Структура

\\\
backend/          # FastAPI + SQLAlchemy + Alembic
frontend/         # Next.js 14 + React + Recharts
services/
  ├── agent/      # Агент сбора метрик
  └── prober/     # Зонд проверки доступности
docker-compose.yml
\\\

## 🎯 Особенности

- ✅ FastAPI с WebSocket real-time обновлениями
- ✅ React фронтенд с Recharts графиками
- ✅ SQLite локально + PostgreSQL на продакшене
- ✅ Агент для сбора метрик (каждые 10s)
- ✅ Зонд для проверки веб-сайтов (каждые 30s)
- ✅ Prometheus на \/metrics\
- ✅ Темная тема с CSS переменными
- ✅ Cross-platform

## 🛠️ API

| Метод | Endpoint | Описание |
|-------|----------|---------|
| GET | \/health\ | Проверка здоровья |
| POST | \/api/metrics\ | Отправить метрики |
| POST | \/api/probe\ | Результат проверки |
| WS | \/ws\ | Live обновления |
| GET | \/api/servers\ | Список серверов |
| GET | \/api/websites\ | Список веб-сайтов |
| GET | \/api/alerts\ | Алерты |
| GET | \/metrics\ | Prometheus метрики |

## 🎨 Фронтенд

- **Главная** — Обзор системы
- **Серверы** — Метрики + live графики (WebSocket)
- **Веб-сайты** — Статус доступности (WebSocket)
- **Алерты** — Оповещения с критичностью

## 💾 База данных

- **Локально:** SQLite в \ackend/data/monitoring.db\
- **Production:** PostgreSQL (\DATABASE_URL=postgresql://...\)

## 🐛 Troubleshooting

**asyncpg error на Windows?** → Используйте \
equirements-local.txt\

**WebSocket не работает?** → Установите в \rontend/.env.local\: \NEXT_PUBLIC_API_URL=http://127.0.0.1:8000\

**Port занят?**
\\\ash
# Windows: netstat -ano | findstr :8000 && taskkill /PID <PID> /F
# Linux: lsof -i :8000 && kill -9 <PID>
\\\

## 🐳 Docker

\\\ash
docker-compose up -d
\\\

## 📝 Лицензия

MIT
