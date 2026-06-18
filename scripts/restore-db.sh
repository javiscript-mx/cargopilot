#!/usr/bin/env bash
#
# Restaura un dump de Postgres (formato custom -Fc) generado por backup-db.sh.
# Un backup que no sabes restaurar no es un backup — prueba esto al menos una vez.
#
# Uso:
#   # desde un archivo local:
#   ./scripts/restore-db.sh ./.backups/hm-hm_sistema-2026-06-18T030000.dump
#
#   # directo desde GCS (descarga a /tmp y restaura):
#   ./scripts/restore-db.sh gs://hm-sistema-backups/db-backups/hm-hm_sistema-2026-06-18T030000.dump
#
# OJO: pg_restore --clean elimina y recrea los objetos antes de cargar.
# Solo úsalo a sabiendas de que vas a sobrescribir el contenido actual.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.prod}"
GCS_KEYFILE="${GCS_KEYFILE:-$REPO_DIR/gcs-backup-sa.json}"

SRC="${1:-}"
[ -n "$SRC" ] || { echo "Uso: $0 <archivo.dump | gs://bucket/ruta.dump>" >&2; exit 1; }

set -a; . "$ENV_FILE"; set +a
DB_USER="${POSTGRES_USER:?}"
DB_NAME="${POSTGRES_DB:-hm_sistema}"

# Si viene de GCS, descargarlo primero
LOCAL="$SRC"
if [[ "$SRC" == gs://* ]]; then
  TMPDIR="$(mktemp -d)"
  LOCAL="$TMPDIR/$(basename "$SRC")"
  echo "Descargando $SRC ..."
  docker run --rm \
    -v "$TMPDIR:/out" -v "$GCS_KEYFILE:/key.json:ro" \
    google/cloud-sdk:alpine sh -c "
      gcloud auth activate-service-account --key-file=/key.json --quiet &&
      gcloud storage cp $SRC /out/$(basename "$SRC")
    "
fi

[ -s "$LOCAL" ] || { echo "No se encontró/quedó vacío: $LOCAL" >&2; exit 1; }

echo "Vas a RESTAURAR $LOCAL sobre la base '$DB_NAME'. Esto sobrescribe datos."
read -r -p "Escribe 'restaurar' para continuar: " confirm
[ "$confirm" = "restaurar" ] || { echo "Cancelado."; exit 1; }

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$LOCAL"

echo "Restauración completada ✓"
