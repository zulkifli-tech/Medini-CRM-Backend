#!/bin/sh
# ============================================================================
# Medini CRM — PostgreSQL backup script (S10 T2)
# Runs inside the backup sidecar container (postgres:16-alpine).
# pg_dump → compressed → /backups volume → retention pruning.
# ============================================================================
set -euo pipefail

BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/medini_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOG="${BACKUP_DIR}/backup.log"

echo "[$(date -Iseconds)] Starting backup of ${POSTGRES_DB} from ${POSTGRES_HOST}" >> "$LOG"

# pg_dump → gzip
pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --no-privileges --clean --if-exists \
  | gzip > "$BACKUP_FILE"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date -Iseconds)] Backup complete: $BACKUP_FILE ($SIZE)" >> "$LOG"

# Retention: delete backups older than RETENTION_DAYS
find "$BACKUP_DIR" -name "medini_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date -Iseconds)] Pruned backups older than ${RETENTION_DAYS} days" >> "$LOG"

# Keep the log itself under 10MB
if [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 10485760 ]; then
  tail -c 5242880 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi
