# Документация по аутентификации и администрированию

## Основная информация

Система мониторинга теперь поддерживает аутентификацию через JWT (JSON Web Tokens) и управление пользователями с тремя ролями:
- **admin** — административный доступ, управление пользователями
- **user** — просмотр и управление мониторингом
- **viewer** — только просмотр (читать только)

## Быстрый старт

### 1. Установка зависимостей

Backend использует дополнительные пакеты:
- `python-jose` — для JWT токенов
- `passlib[bcrypt]` — для хеширования паролей
- `email-validator` — для валидации email
- `python-multipart` — для обработки форм

```bash
cd backend
pip install -r requirements-local.txt  # для local development
# или
pip install -r requirements.txt        # для production
```

### 2. Запуск backend

Для безопасного bootstrap администратора задайте переменные окружения перед первым запуском:

- **INITIAL_ADMIN_EMAIL**
- **INITIAL_ADMIN_PASSWORD**
- **SECRET_KEY**

```bash
cd backend
set SECRET_KEY=your-strong-secret-key
set INITIAL_ADMIN_EMAIL=admin@example.com
set INITIAL_ADMIN_PASSWORD=change-this-password
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Запуск frontend

```bash
cd frontend
npm install  # только в первый раз
npm run dev
```

## Использование

### Вход в систему

1. Откройте http://127.0.0.1:3000
2. Будете перенаправлены на страницу входа `/auth/login`
3. Введите bootstrap-учетку, заданную через `INITIAL_ADMIN_EMAIL` и `INITIAL_ADMIN_PASSWORD`

### Регистрация новых пользователей

Пользователи могут зарегистрироваться через страницу `/auth/register`

**Требования:**
- Email: валидный email адрес
- Имя пользователя: минимум 3 символа
- Пароль: минимум 6 символов

При регистрации новому пользователю автоматически присваивается роль **viewer** (только чтение).

### Администраторская панель

Только администраторы имеют доступ к `/admin`:

1. **Просмотр пользователей** — список всех зарегистрированных пользователей
2. **Управление пользователями:**
  - Изменение роли (admin, user, viewer)
  - Активация/деактивация пользователей
  - Удаление пользователей
3. **Статистика:**
   - Всего пользователей
   - Количество администраторов
   - Количество активных пользователей

## API Endpoints

### Аутентификация

**POST `/api/auth/register`**
```json
{
  "email": "user@example.com",
  "username": "user",
  "password": "password123"
}
```

**POST `/api/auth/login`**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Возвращает:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "user",
    "role": "viewer"
  }
}
```

**GET `/api/auth/me`**
Требует Bearer токен. Возвращает информацию о текущем пользователе.

### Управление пользователями (только для админов)

**GET `/api/admin/users`**
Получить список всех пользователей.

**GET `/api/admin/users/{user_id}`**
Получить информацию о конкретном пользователе.

**PUT `/api/admin/users/{user_id}`**
Обновить пользователя:
```json
{
  "username": "new_username",
  "email": "new_email@example.com",
  "role": "admin",
  "is_active": true
}
```

**DELETE `/api/admin/users/{user_id}`**
Удалить пользователя.

**POST `/api/admin/users`**
Создать нового пользователя (только администратор).

### Мониторинг API (admin)

**GET `/api/api-monitoring/status`**
Текущее состояние API-checker по сервисам.

**GET `/api/api-monitoring/history`**
История проверок API (последние результаты).

**POST `/api/api-monitoring/check`**
Ручной запуск проверки API.

### Ingest endpoints (agent/prober)

**POST `/api/metrics`**
Принимает системные метрики от агента.

**POST `/api/probe`**
Принимает результаты проб веб-сайтов.

**POST `/api/logs`**
Принимает логи от агентов/проберов.

## Безопасность

### JWT токены
- Время жизни: 30 минут
- Хранятся в `localStorage` на frontend
- Автоматически добавляются в заголовок `Authorization: Bearer <token>` для всех запросов

### Защита ingest-эндпоинтов
- `/api/metrics`, `/api/probe`, `/api/logs` защищены ключом `X-Ingest-Key`
- Ключ задается через `INGEST_API_KEY` / `AGENT_KEY` или несколько ключей через `INGEST_API_KEYS`
- В новой версии поддерживается регистрация ключей агентов в базе через `/api/agent/keys`, `/api/servers/{server_id}/agent-key` и отзыв через `/api/servers/{server_id}/agent-keys/{key_id}`
- Для локальной разработки можно временно включить `ALLOW_LOCAL_INGEST_WITHOUT_KEY=true`

### Rate limiting
- Для `/api/auth/login` действует ограничение частоты запросов по IP

### Пароли
- Хешируются с использованием bcrypt
- Оригинальные пароли никогда не сохраняются

### Защита маршрутов
Все страницы (кроме `/auth/login` и `/auth/register`) защищены:
- Требуют токен авторизации
- Проверяют наличие пользователя в localStorage
- При истечении токена пользователь перенаправляется на вход

## Пользовательский интерфейс

### Sidebar
- Отображает информацию о текущем пользователе
- Показывает роль пользователя
- Кнопка "Выход" для деавторизации
- Для администраторов добавляется ссылка на админ панель
- Для администраторов доступен раздел API мониторинга

### Страницы
- **`/auth/login`** — вход в систему
- **`/auth/register`** — регистрация новых пользователей
- **`/`** — главная страница (защищена)
- **`/api-monitoring`** — мониторинг backend API (admin)
- **`/servers`** — управление серверами (защищена)
- **`/websites`** — управление веб-сайтами (защищена)
- **`/alerts`** — алерты (защищена)
- **`/logs`** — системные и агентские логи (защищена)
- **`/docker`** — Docker мониторинг (защищена)
- **`/kubernetes`** — Kubernetes мониторинг (защищена)
- **`/vms`** — виртуальные машины (защищена)
- **`/notifications`** — уведомления (защищена)
- **`/telegram`** — интеграция Telegram (защищена)
- **`/settings`** — настройки (защищена)
- **`/organizations`** — организации (защищена)
- **`/admin`** — администраторская панель (только для админов)

## Примеры использования API

### Вход и получение токена

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "<INITIAL_ADMIN_PASSWORD>"
  }'
```

### Получение информации о текущем пользователе

```bash
curl -X GET http://127.0.0.1:8000/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

### Получить список пользователей (admin only)

```bash
curl -X GET http://127.0.0.1:8000/api/admin/users \
  -H "Authorization: Bearer <access_token>"
```

### Создать пользователя (admin only)

```bash
curl -X POST http://127.0.0.1:8000/api/admin/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "email": "newuser@example.com",
    "username": "newuser",
    "password": "password123"
  }'
```

## Решение проблем

### "Invalid token"
- Токен истек (30 минут)
- Решение: заново войдите в систему

### "Email already registered"
- Email используется другим пользователем
- Решение: используйте другой email при регистрации

### "Username already taken"
- Имя пользователя занято
- Решение: выберите другое имя пользователя

### "Not enough permissions"
- Операция требует роль администратора
- Решение: запросите роль admin у администратора

### "Unauthorized ingest request"
- Не передан или неверный `X-Ingest-Key`
- Решение: проверьте `INGEST_API_KEY` на backend и в агенте/пробере
- Для локального теста можно включить `ALLOW_LOCAL_INGEST_WITHOUT_KEY=true`

## Переменные окружения

**Backend:**
```bash
DATABASE_URL=sqlite:///./data/monitoring.db  # By default, SQLite
SECRET_KEY=your-strong-secret-key            # Обязательный параметр
DEV_ALLOW_INSECURE_SECRET=false              # Только для локальной отладки
INITIAL_ADMIN_EMAIL=admin@example.com        # Bootstrap admin
INITIAL_ADMIN_PASSWORD=change-this-password  # Bootstrap admin password
INGEST_API_KEY=change-this-ingest-key        # Защита /api/metrics,/api/probe,/api/logs
INGEST_API_KEYS=agent1key,agent2key         # Дополнительные ключи ingest; добавляет поддержку множественных ключей
ALLOW_LOCAL_INGEST_WITHOUT_KEY=false         # true только для localhost dev
```

На production обязательно измените `SECRET_KEY` на случайный сложный ключ!
На production обязательно оставляйте `ALLOW_LOCAL_INGEST_WITHOUT_KEY=false`.

```bash
# Генерировать SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Frontend:**
```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000  # API базовый URL
```
