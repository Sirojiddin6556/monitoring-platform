# Локальный запуск backend без Docker

1) Активируйте виртуальное окружение проекта (если ещё не):

PowerShell:

```powershell
& .\venv\Scripts\Activate.ps1
```

Unix (bash):

```bash
source ./venv/bin/activate
```

2) Установите локальные зависимости (используют `aiosqlite` вместо `asyncpg`):

```powershell
python -m pip install -r backend/requirements-local.txt
```

3) Запустите backend (по умолчанию использует sqlite файл `./data/monitoring.db`):

PowerShell:

```powershell
.\backend\run_local.ps1
```

Unix:

```bash
./backend/run_local.sh
```

4) Откройте UI: `http://127.0.0.1:3000` (если фронтенд запущен отдельно) и API backend: `http://127.0.0.1:8000`.

Дополнительно:

- Для локального режима скрипты запуска выставляют dev-настройки `SECRET_KEY`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`.
- Если хотите защитить ingestion endpoints, задайте `INGEST_API_KEY` в backend и в агенте/зонде.

Примечание: этот режим предназначен для локальной разработки и демо — в продакшене используйте Postgres и контейнеры/инфраструктуру.
