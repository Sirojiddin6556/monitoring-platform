# DevOps & CI/CD Deployment Pipeline Specification

## 1. Среда развертывания
Проект разворачивается в Docker-контейнерах с использованием `docker-compose`. 

## 2. Архитектурный контур CI/CD (GitHub Actions / GitLab CI)
```yaml
stages:
  - lint-and-test     # Статический анализ кода и запуск юнит-тестов
  - build-images      # Сборка Docker-образов (backend, frontend, agent, prober)
  - push-registry     # Пуш образов в Docker Registry (например, GitLab Registry / GHCR)
  - deploy            # Деплой на целевой сервер через SSH (docker compose pull && docker compose up -d)
```

## 3. Конфигурация Docker Compose (Релиз)
*   Бэкенд слушает внутренний порт 8000 и мапится наружу на порт **`9000`** (для предотвращения конфликтов с локальными веб-приложениями разработчиков).
*   Фронтенд слушает порт **`3000`**.
*   Потоки логов Docker-контейнеров агрегируются стандартным драйвером `json-file` с ограничением размера файлов (max-size: 10m, max-file: 3) во избежание переполнения диска.
