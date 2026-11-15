#!/usr/bin/env bash
# WorkUco · copia de seguridad de la base y de las fotos/CV subidos.
# Se instala como /usr/local/bin/workuco-backup y corre todos los días (cron).
# Guarda 14 días en /var/backups/workuco. Para restaurar, ver deploy/LEEME-DEPLOY.md.
set -euo pipefail
DATA_DIR="${WORKUCO_DATA:-/var/lib/workuco}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/workuco}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y-%m-%d_%H%M)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# copia consistente de SQLite aunque el servidor esté funcionando
sqlite3 "$DATA_DIR/workuco.sqlite" ".backup '$BACKUP_DIR/workuco-$STAMP.sqlite'"
gzip -f "$BACKUP_DIR/workuco-$STAMP.sqlite"
# fotos, flyers y CV
if [ -d "$DATA_DIR/uploads" ]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads
fi
find "$BACKUP_DIR" -type f -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') copia lista: $BACKUP_DIR (workuco-$STAMP.sqlite.gz, uploads-$STAMP.tar.gz)"
