#!/usr/bin/env bash
# Restauration à partir d'un fichier de sauvegarde .sql.gz créé par backup.sh
# Usage : ./scripts/restore.sh ./backups/superette-20260101-020000.sql.gz
# ATTENTION : écrase les données actuelles de la base cible. Confirme avant de lancer en production.
set -euo pipefail
cd "$(dirname "$0")/.."
export $(grep -v '^#' .env | xargs)

FILE="${1:?Usage: ./scripts/restore.sh chemin/vers/sauvegarde.sql.gz}"
read -p "Ceci va ÉCRASER les données actuelles de la base. Continuer ? (oui/non) " CONFIRM
if [ "$CONFIRM" != "oui" ]; then echo "Annulé."; exit 1; fi

gunzip -c "$FILE" | psql "$DATABASE_URL"
echo "✔ Restauration terminée depuis $FILE"
