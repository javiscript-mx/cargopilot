#!/usr/bin/env bash
#
# Backup de Postgres → Google Cloud Storage, pensado para correr por cron en el VPS.
#
#   - Vuelca la BD con pg_dump en formato custom (-Fc): comprimido y restaurable
#     selectivamente con pg_restore.
#   - Sube el dump a GCS reutilizando el mismo service account del proyecto.
#   - Limpia los dumps locales viejos (la retención remota se gestiona con una
#     Lifecycle Rule del bucket — ver scripts/gcs-backup-lifecycle.json).
#
# El host solo necesita Docker; no requiere instalar postgres-client ni gcloud:
# usa los contenedores `postgres` (del compose) y `google/cloud-sdk:alpine`.
#
# Uso:
#   ./scripts/backup-db.sh
#
# Config por variables de entorno (todas tienen default sensato):
#   GCS_BACKUP_BUCKET   bucket destino, sin gs://   (REQUERIDO)
#   GCS_BACKUP_PREFIX   carpeta dentro del bucket    (default: db-backups)
#   GCS_KEYFILE         JSON del service account     (default: <repo>/gcs-backup-sa.json)
#   RETENTION_DAYS      días que se conservan en local (default: 7)
#   COMPOSE_FILE        ruta al compose de prod      (default: <repo>/docker-compose.prod.yml)
#   ENV_FILE            ruta al .env.prod            (default: <repo>/.env.prod)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

COMPOSE_FILE="${COMPOSE_FILE:-$REPO_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env.prod}"
GCS_BACKUP_BUCKET="${GCS_BACKUP_BUCKET:-}"
GCS_BACKUP_PREFIX="${GCS_BACKUP_PREFIX:-db-backups}"
GCS_KEYFILE="${GCS_KEYFILE:-$REPO_DIR/gcs-backup-sa.json}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
WORKDIR="${BACKUP_WORKDIR:-$REPO_DIR/.backups}"

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ]   || fail "No existe $ENV_FILE"
[ -n "$GCS_BACKUP_BUCKET" ] || fail "Falta GCS_BACKUP_BUCKET (bucket de backups, sin gs://)"
[ -f "$GCS_KEYFILE" ] || fail "No existe el service account $GCS_KEYFILE"

# Credenciales de la BD desde el mismo .env.prod del compose
set -a; . "$ENV_FILE"; set +a
DB_USER="${POSTGRES_USER:?POSTGRES_USER no está en $ENV_FILE}"
DB_NAME="${POSTGRES_DB:-hm_sistema}"

mkdir -p "$WORKDIR"
STAMP="$(date '+%Y-%m-%dT%H%M%S')"
FILENAME="hm-${DB_NAME}-${STAMP}.dump"
DEST="$WORKDIR/$FILENAME"

# 1) Dump desde el contenedor de Postgres (no se expone al host)
log "Volcando $DB_NAME → $FILENAME"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$DEST"

# pg_dump pudo salir 0 con archivo vacío si algo raro pasó: validar tamaño
[ -s "$DEST" ] || fail "El dump quedó vacío — se aborta sin subir"
log "Dump listo ($(du -h "$DEST" | cut -f1))"

# 2) Subida a GCS con el service account (vía contenedor cloud-sdk, sin instalar nada)
log "Subiendo a gs://$GCS_BACKUP_BUCKET/$GCS_BACKUP_PREFIX/"
docker run --rm \
  -v "$WORKDIR:/backups:ro" \
  -v "$GCS_KEYFILE:/key.json:ro" \
  google/cloud-sdk:alpine sh -c "
    gcloud auth activate-service-account --key-file=/key.json --quiet &&
    gcloud storage cp /backups/$FILENAME gs://$GCS_BACKUP_BUCKET/$GCS_BACKUP_PREFIX/$FILENAME
  "
log "Subido ✓"

# 3) Retención local (la remota la maneja la Lifecycle Rule del bucket)
find "$WORKDIR" -name 'hm-*.dump' -type f -mtime "+$RETENTION_DAYS" -print -delete \
  | sed 's/^/  borrado local: /' || true

log "Backup completado"
