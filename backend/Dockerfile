FROM python:3.11-slim

WORKDIR /app

# Use key=value form for ENV to avoid legacy format warnings
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

# Install build deps and runtime deps, then remove build deps to keep image small
COPY requirements.txt /app/requirements.txt
RUN apt-get update \
	&& apt-get install -y --no-install-recommends build-essential gcc libpq-dev \
	&& python -m pip install --upgrade pip setuptools wheel \
	&& python -m pip install --no-cache-dir -r /app/requirements.txt \
	&& apt-get purge -y --auto-remove build-essential gcc \
	&& rm -rf /var/lib/apt/lists/*

COPY ./app /app/app
COPY ./alembic.ini /app/alembic.ini
COPY ./migrations /app/migrations

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
