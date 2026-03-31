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

При первом запуске backend автоматически создает администратора:
- **Email:** `admin@example.com`
- **Пароль:** `admin123`

```bash
cd backend
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
3. Введите email и пароль по умолчанию:
   - Email: `admin@example.com`
   - Пароль: `admin123`

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
   - Активация/деактивация пользователейи
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

## Безопасность

### JWT токены
- Время жизни: 30 минут
- Хранятся в `localStorage` на frontend
- Автоматически добавляются в заголовок `Authorization: Bearer <token>` для всех запросов

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

### Страницы
- **`/auth/login`** — вход в систему
- **`/auth/register`** — регистрация новых пользователей
- **`/`** — главная страница (защищена)
- **`/servers`** — управление серверами (защищена)
- **`/websites`** — управление веб-сайтами (защищена)
- **`/alerts`** — алерты (защищена)
- **`/admin`** — администраторская панель (только для админов)

## Примеры использования API

### Вход и получение токена

```bash
curl -X POST http://127.0.0.1:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
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

## Переменные окружения

**Backend:**
```bash
DATABASE_URL=sqlite:///./data/monitoring.db  # By default, SQLite
SECRET_KEY=your-secret-key                   # По умолчанию: 'your-secret-key-change-in-production'
```

На production обязательно измените `SECRET_KEY` на случайный сложный ключ!

```bash
# Генерировать SECRET_KEY
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Frontend:**
```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000  # API базовый URL
```
