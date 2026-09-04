# Скрипты запуска проекта / Project Launch Scripts

Обновленные скрипты для локального запуска Monitoring Platform с улучшенной обработкой ошибок, логированием и кроссплатформной поддержкой.

## Структура скриптов / Script Structure

### Windows (PowerShell)
- **`run_local_all_hidden.ps1`** — Запуск backend и frontend в скрытых окнах
- **`stop_local_all_hidden.ps1`** — Остановка всех сервисов

### Linux/macOS (Bash)
- **`run_local_all_hidden.sh`** — Запуск backend и frontend в фоне
- **`stop_local_all_hidden.sh`** — Остановка всех сервисов

### Backend (обе платформы)
- **`backend/run_local.ps1`** — Запуск только backend (PowerShell)
- **`backend/run_local.sh`** — Запуск только backend (Bash)

---

## Быстрый старт / Quick Start

### Windows

```powershell
# Запустить оба сервиса
.\scripts\run_local_all_hidden.ps1

# Остановить оба сервиса
.\scripts\stop_local_all_hidden.ps1

# Запустить только backend
.\backend\run_local.ps1

# С режимом автоперезагрузки
$env:BACKEND_RELOAD=1; .\backend\run_local.ps1
```

### Linux/macOS

```bash
# Запустить оба сервиса
bash ./scripts/run_local_all_hidden.sh

# Остановить оба сервиса
bash ./scripts/stop_local_all_hidden.sh

# Запустить только backend
bash ./backend/run_local.sh

# С режимом автоперезагрузки
BACKEND_RELOAD=1 bash ./backend/run_local.sh
```

---

## Что запускается / What Gets Started

Когда вы запускаете `run_local_all_hidden`:

| Компонент | Порт | URL | Назначение |
|-----------|------|-----|-----------|
| Frontend (Next.js) | 3000 | http://127.0.0.1:3000 | Web UI |
| Backend (FastAPI) | 8000 | http://127.0.0.1:8000 | REST API |
| API Docs | 8000 | http://127.0.0.1:8000/docs | Swagger UI |

### Учетные данные по умолчанию / Default Credentials
```
Email:    admin@example.com
Password: admin123
```

---

## Переменные окружения / Environment Variables

Все переменные можно переопределить перед запуском:

### Backend
```powershell
# PowerShell
$env:SECRET_KEY = "your-secret-key"
$env:INITIAL_ADMIN_EMAIL = "admin@company.com"
$env:INITIAL_ADMIN_PASSWORD = "secure-password"
$env:INGEST_API_KEY = "your-api-key"
$env:BACKEND_RELOAD = 1  # Enable reload mode

# Bash
export SECRET_KEY="your-secret-key"
export INITIAL_ADMIN_EMAIL="admin@company.com"
export INITIAL_ADMIN_PASSWORD="secure-password"
export INGEST_API_KEY="your-api-key"
export BACKEND_RELOAD=1
```

---

## Логи и отладка / Logs and Debugging

Логи хранятся в `.runtime/`:

```
.runtime/
├── backend.pid           # PID процесса backend
├── frontend.pid          # PID процесса frontend
├── backend.out.log       # Stdout backend
├── backend.err.log       # Stderr backend
├── frontend.out.log      # Stdout frontend
└── frontend.err.log      # Stderr frontend
```

### Просмотр логов / View Logs

**PowerShell:**
```powershell
Get-Content .\.runtime\backend.err.log -Tail 50
Get-Content .\.runtime\frontend.out.log -Tail 50
```

**Bash:**
```bash
tail -f .runtime/backend.err.log
tail -f .runtime/frontend.out.log
```

---

## Возможные проблемы / Troubleshooting

### Ошибка: "venv\Scripts\python.exe not found"
```powershell
# Создайте виртуальное окружение
python -m venv venv
```

### Ошибка: "frontend\node_modules\next\dist\bin\next not found"
```bash
cd frontend
npm install
```

### Порт уже занят (Port already in use)
Скрипты автоматически убивают процессы на портах 8000 и 3000. Если это не сработало:

**PowerShell:**
```powershell
Get-NetTCPConnection -LocalPort 8000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Bash:**
```bash
lsof -ti:8000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

---

## Особенности обновленных скриптов / Updates

✅ **Улучшенная обработка ошибок** — Явная валидация зависимостей перед стартом  
✅ **Кроссплатформность** — Одинаковая функциональность на Windows/Linux/macOS  
✅ **Информативный вывод** — Цветной вывод с таймстемпами и символами статуса  
✅ **Мониторинг здоровья** — Проверка живых процессов после запуска  
✅ **Полное логирование** — Все stdout/stderr сохраняется в `.runtime/`  
✅ **Режим автоперезагрузки** — `BACKEND_RELOAD=1` для разработки  
✅ **Корректное завершение** — Graceful shutdown и очистка портов  

---

## Примеры использования / Usage Examples

### Полный цикл разработки / Full Development Cycle

```powershell
# 1. Запустить сервисы
.\scripts\run_local_all_hidden.ps1

# (В другом терминале)
# 2. Разработка с автоперезагрузкой
$env:BACKEND_RELOAD=1
.\backend\run_local.ps1

# 3. Просмотр логов
tail -f .\.runtime\backend.out.log
tail -f .\.runtime\frontend.out.log

# 4. Остановка
.\scripts\stop_local_all_hidden.ps1
```

### CI/CD Integration

```bash
# Install dependencies
python -m venv venv
./venv/bin/pip install -r backend/requirements-local.txt
cd frontend && npm install && cd ..

# Run tests with the scripts
bash ./scripts/run_local_all_hidden.sh &
sleep 5
# Run your tests against http://127.0.0.1:8000 and :3000
bash ./scripts/stop_local_all_hidden.sh
```

---

## Notes / Примечания

- Скрипты используют SQLite для локальной разработки (`.data/monitoring.db`)
- В production используйте Docker и PostgreSQL
- Убедитесь, что порты 3000 и 8000 свободны перед запуском
- Для дальнейшего развития смотрите документацию в `DEPLOYMENT_GUIDE.md`
