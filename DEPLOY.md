# Deploy en Railway

## Setup inicial (una sola vez)

1. Crea un proyecto en railway.app
2. Agrega un addon de PostgreSQL al proyecto
3. Crea dos servicios desde el mismo repositorio:
   - Servicio "api" → apunta al Dockerfile: `apps/api/Dockerfile`
   - Servicio "web" → apunta al Dockerfile: `apps/web/Dockerfile`

## Variables de entorno — Servicio API

```
DATABASE_URL          → copia el valor de Railway (se genera automáticamente con el addon de PostgreSQL)
BETTER_AUTH_SECRET    → genera con: openssl rand -base64 32
BETTER_AUTH_URL       → https://tu-dominio-api.railway.app
FACTURAMA_USER        → tu usuario de Facturama
FACTURAMA_PASSWORD    → tu password de Facturama
FACTURAMA_SANDBOX     → false (en producción)
EMISOR_CP             → código postal de tu empresa
CORS_ORIGIN           → https://tu-dominio-web.railway.app
NODE_ENV              → production
PORT                  → 3001
ADMIN_SEED_PASSWORD   → contraseña segura para el admin inicial
```

## Variables de entorno — Servicio Web

```
VITE_API_URL          → https://tu-dominio-api.railway.app
```

> Nota: VITE_API_URL se usa en build time. Si cambias el dominio del API debes hacer redeploy del Web.

## Primer deploy

Railway corre automáticamente las migraciones y el seed en el primer arranque
gracias al CMD del Dockerfile de producción:

```
prisma migrate deploy && node apps/api/dist/index.js
```

Para correr el seed manualmente desde Railway CLI:
```bash
railway run --service api pnpm --filter @hm/api db:seed
```

## Credenciales iniciales

- Email: admin@hmsistema.mx
- Password: el valor de ADMIN_SEED_PASSWORD que configuraste

---

# Deploy en VPS (IONOS u otro)

Alternativa autogestionada y más económica que Railway. Todo corre en una sola
máquina con `docker-compose.prod.yml` (Postgres interno + API + web + Caddy con
TLS automático). Para 5 usuarios y pocas operaciones/semana sobra con un VPS
chico (2 vCPU / 4 GB).

## 0. Preparar el VPS (una vez)

```bash
# Como root en el VPS (Ubuntu/Debian)
apt update && apt install -y docker.io docker-compose-plugin git
systemctl enable --now docker
```

Apunta tu dominio (registro A) a la IP del VPS antes de levantar Caddy, o el
certificado TLS no se podrá emitir.

## 1. Clonar y configurar

```bash
git clone <repo> /opt/hm-sistema && cd /opt/hm-sistema
cp .env.prod.example .env.prod
# Edita .env.prod: DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD,
# BETTER_AUTH_SECRET (openssl rand -base64 32), Facturama, GCS, etc.
```

## 2. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

El API corre `prisma migrate deploy` solo en cada arranque (idempotente).
**Seed e import de catálogos SAT son manuales la primera vez:**

```bash
# Admin inicial + catálogos base
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  pnpm --filter @hm/api db:seed

# Catálogos SAT grandes (ClaveProdServ 52k + ClaveUnidad 2.4k) — solo una vez
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api \
  pnpm --filter @hm/api db:import-sat
```

## 3. Documentos a GCS (recomendado en producción)

En `.env.prod` define `GCS_PROJECT_ID` y `GCS_CREDENTIALS_JSON` (el JSON del
service account en una sola línea). Luego, ya logueado como admin, entra a
**Configuración → Almacenamiento** y escribe el nombre del bucket. A partir de
ahí los documentos (incluidos XML/PDF de CFDI) se guardan en GCS y sobreviven a
recrear los contenedores. Si no se configura, caen al volumen `documents_data`.

## 4. Backups de Postgres → GCS (no opcional: hay datos fiscales)

El volumen de Postgres **no es un backup** (un fallo de disco o un borrado lógico
se lo lleva). `scripts/backup-db.sh` vuelca la BD con `pg_dump -Fc` y la sube a
GCS. Setup:

```bash
# 1) Service account con permiso de escritura en el bucket de backups.
#    Guarda su JSON en el VPS (puede ser el mismo SA de documentos):
#    /opt/hm-sistema/gcs-backup-sa.json
chmod 600 /opt/hm-sistema/gcs-backup-sa.json

# 2) Crea un bucket SOLO para backups y aplícale retención de 90 días:
gcloud storage buckets create gs://hm-sistema-backups --location=us-central1
gcloud storage buckets update gs://hm-sistema-backups \
  --lifecycle-file=scripts/gcs-backup-lifecycle.json

# 3) Prueba el backup a mano:
GCS_BACKUP_BUCKET=hm-sistema-backups ./scripts/backup-db.sh

# 4) Prográmalo en cron (diario 3am). crontab -e:
0 3 * * * GCS_BACKUP_BUCKET=hm-sistema-backups /opt/hm-sistema/scripts/backup-db.sh >> /var/log/hm-backup.log 2>&1
```

Restaurar (pruébalo al menos una vez para confiar en el backup):

```bash
./scripts/restore-db.sh gs://hm-sistema-backups/db-backups/<archivo>.dump
```

## 5. Actualizar a una versión nueva

```bash
cd /opt/hm-sistema && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# Las migraciones corren solas al reiniciar el API.
```

## Notas

- Postgres **no** está expuesto al exterior (sin `ports:` en el compose); solo
  Caddy escucha en 80/443.
- La web usa rutas relativas (`/api`), así que no necesita `VITE_API_URL` en
  prod: Caddy enruta `/api/*` al backend en el mismo dominio.
- Backups (paso 4) **+** documentos en GCS (paso 3) = recuperación total: si el
  VPS desaparece, levantas otro, restauras el dump y los documentos ya están en
  GCS. Uno no sustituye al otro: el dump es la base (clientes, facturas,
  relaciones); GCS son los archivos.
