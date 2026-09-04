# 03. Product Manager Report — SaaS Upgrade Backlog & Roadmap

## 1. Разбивка на Epics & Features

### Epic 1: Рефакторинг и Чистота архитектуры (Технический долг)
* **Feature 1.1**: Декомпозиция монолита `backend/app/main.py`. Вынос маршрутов сбора метрик и логов в независимые роутеры.
* **Feature 1.2**: Оптимизация стилей Next.js. Разделение глобального `global.css` на CSS-модули для страниц `servers.js`, `websites.js` и т.д.

### Epic 2: DevOps и Сборка под Production
* **Feature 2.1**: Внедрение Multi-stage Dockerfile для фронтенда Next.js (сборка билда на Node, раскатка мини-образа standalone).
* **Feature 2.2**: Добавление пред-деплойных проверок (Quality Gate) безопасности в CI/CD GitHub Actions.

### Epic 3: SaaS Безопасность и Валидация
* **Feature 3.1**: Проверка и тестирование БД-авторизации сессий JWT в `/api/auth/me` и других защищенных эндпоинтах.

---

## 2. Приоритеты и Спринты (Roadmap & Sprint Backlog)

### Спринт 1: Архитектурный рефакторинг и Оптимизация (Текущий Спринт)
1. **Декомпозиция `main.py`**:
   - Вынести `/api/metrics` в `routers/metrics.py`.
   - Вынести `/api/logs` в `routers/logs.py`.
   - Вынести `/api/probe` в `routers/probers.py`.
2. **CSS-модули**:
   - Перевести ключевые страницы панели управления серверами на локальные стили.
3. **Multi-stage Docker**:
   - Обновить Dockerfile фронтенда и бэкенда.

---

## 3. Критерии готовности (Definition of Done — DoD)
- **Код**: Прошел проверку линтера `ruff` или `flake8`, не содержит закомментированных debug-блоков.
- **Тесты**: Все тесты бэкенда (`pytest`) проходят успешно. Покрытие тестов не падает.
- **Docker**: Локальная сборка контейнеров через `docker compose` проходит без ошибок.
- **CI/CD**: Пайплайн GitHub Actions показывает зеленый статус.
