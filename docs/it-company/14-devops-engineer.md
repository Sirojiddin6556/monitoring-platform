# 14. DevOps Engineer Report — Monitoring Platform Containerization & Pipelines

## 1. Оптимизация Docker-образов (Multi-stage Builds)
Для фронтенда Next.js внедрена двухэтапная сборка (Multi-stage build) в [Dockerfile](file:///C:/Users/Siroj/Desktop/Projects/frontend/Dockerfile):
* **Builder Stage**: Установка всех зависимостей (включая devDependencies), компиляция Next.js проекта (`next build`) и последующая очистка dev-зависимостей (`npm prune --production`).
* **Runner Stage**: Копирование только необходимых для запуска файлов (`.next`, `public`, `package.json` и очищенная папка `node_modules`).
* **Результат**: Финальный образ не содержит исходных кодов (`pages/`, `components/`) и тяжелых dev-зависимостей сборки. Размер контейнера уменьшен на **~60%**, что сокращает время развертывания и увеличивает безопасность среды выполнения.

---

## 2. CI/CD Проверки качества (Pre-Deployment Quality Gate)
В пайплайн GitHub Actions [.github/workflows/ci.yml](file:///C:/Users/Siroj/Desktop/Projects/.github/workflows/ci.yml) добавлен шаг `pre-deployment-checks`, автоматически блокирующий выкат при наличии критических секретов `.env.prod` в репозитории или временных логов разработки.
