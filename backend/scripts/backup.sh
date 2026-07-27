#!/usr/bin/env bash
# Sauvegarde complète de la base de données. À planifier (cron quotidien) sur ton serveur/hébergeur,
# ou à utiliser ponctuellement avant une opération sensible.
# Usage : ./scripts/backup.sh   (lit DATABASE_URL depuis .env)
set -euo pipefail
cd "$(dirname "$0")/.."
export $(grep -v '^#' .env | xargs)

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
FILENAME="$BACKUP_DIR/superette-$(date +%Y%m%d-%H%M%S).sql"

pg_dump "$DATABASE_URL" --no-owner --no-privileges -f "$FILENAME"
gzip "$FILENAME"
echo "✔ Sauvegarde créée : $FILENAME.gz"

# Conserve seulement les 30 dernières sauvegardes locales (les hébergeurs gérés type Supabase/Neon
# conservent en plus leurs propres sauvegardes automatiques côté serveur, indépendamment de ce script).
ls -1t "$BACKUP_DIR"/*.gz | tail -n +31 | xargs -r rm --
