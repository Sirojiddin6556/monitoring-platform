#!/bin/bash
set -e

BACKUP_DIR="/opt/monitoring-platform/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/monitoring_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting PostgreSQL backup..."
docker exec -i infrastructure-db-postgres-1 pg_dump -U monitoring monitoring | gzip > "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${SIZE})"

# Delete backups older than 14 days
find "${BACKUP_DIR}" -name "monitoring_*.sql.gz" -mtime +14 -delete
echo "[$(date)] Old backups rotation completed."
