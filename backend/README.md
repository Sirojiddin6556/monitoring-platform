# Backend (FastAPI)

Минимальный backend на FastAPI. Содержит health-check и WebSocket endpoint.

Запуск (локально, без Docker):

```bash
python -m venv .venv
source .venv/bin/activate  # или .venv\Scripts\activate на Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

В контейнере: `docker build -t monitoring-backend .` и запуск через docker-compose (см. infrastructure/docker-compose.yml).
