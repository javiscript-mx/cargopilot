# Despliegue en VPS Ubuntu

Arquitectura: Docker Compose con 4 contenedores.

```
Internet ──► Caddy :80/:443 (TLS automático Let's Encrypt)
              ├── /api/*, /docs, /health ──► api (Fastify :3001)
              └── /* ──────────────────────► web (nginx, SPA estática)
                                              api ──► postgres (red interna)
```

Postgres y el API **no exponen puertos al exterior** — solo Caddy escucha en 80/443.

---

## Requisitos previos

- VPS Ubuntu 22.04+ con al menos 2 GB RAM
- Un dominio (o subdominio) apuntando con un registro **A** a la IP del VPS
- Puertos 80 y 443 abiertos

## 1. Preparar el servidor

```bash
# Conectar
ssh root@TU_IP

# Actualizar e instalar Docker (script oficial)
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Firewall básico
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# (Recomendado) usuario no-root para operar
adduser deploy
usermod -aG docker deploy
su - deploy
```

## 2. Clonar y configurar

```bash
git clone <URL_DEL_REPO> hm-sistema
cd hm-sistema

cp .env.prod.example .env.prod
nano .env.prod
```

Llena `.env.prod`:

| Variable | Cómo obtenerla |
|---|---|
| `DOMAIN` | tu dominio, ej. `sistema.tuempresa.mx` (sin https://) |
| `ACME_EMAIL` | correo para avisos de Let's Encrypt |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `ADMIN_SEED_PASSWORD` | password inicial del admin |
| `FACTURAMA_*` | credenciales del PAC (sandbox primero) |
| `VITE_GOOGLE_MAPS_API_KEY` | consola de Google Cloud → APIs |
| `GCS_*` | proyecto y service account JSON (en una sola línea) |

## 3. Levantar

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

El primer build tarda varios minutos. El API ejecuta las migraciones
automáticamente al arrancar (`prisma migrate deploy`).

## 4. Seed inicial (solo la primera vez)

Crea el usuario admin y los catálogos:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod \
  exec api pnpm --filter @hm/api exec tsx src/db/seed.ts
```

Login inicial: `admin@hmsistema.mx` + el `ADMIN_SEED_PASSWORD` que definiste.

## 5. Verificar

```bash
docker compose -f docker-compose.prod.yml ps          # todos "running"
curl -s https://TU_DOMINIO/health                     # {"status":"ok",...}
docker compose -f docker-compose.prod.yml logs -f api # logs del API
```

Abre `https://TU_DOMINIO` — Caddy ya habrá emitido el certificado.

---

## Operación diaria

### Actualizar a una nueva versión

```bash
cd ~/hm-sistema
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Las migraciones pendientes corren solas al reiniciar el API.

### Respaldos de la base de datos

```bash
# Respaldo manual
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U hm hm_sistema | gzip > backup-$(date +%F).sql.gz

# Restaurar
gunzip -c backup-2026-06-12.sql.gz | docker compose -f docker-compose.prod.yml \
  exec -T postgres psql -U hm hm_sistema
```

Automatízalo con cron (`crontab -e`):

```cron
0 3 * * * cd /home/deploy/hm-sistema && docker compose -f docker-compose.prod.yml exec postgres pg_dump -U hm hm_sistema | gzip > /home/deploy/backups/hm-$(date +\%F).sql.gz
```

Idealmente sube los respaldos fuera del VPS (al mismo bucket de GCS, por ejemplo).

### Logs y diagnóstico

```bash
docker compose -f docker-compose.prod.yml logs -f api      # API
docker compose -f docker-compose.prod.yml logs -f caddy    # TLS / proxy
docker stats                                               # CPU/RAM por contenedor
```

---

## Notas

- **Cambiar `VITE_GOOGLE_MAPS_API_KEY` o `DOMAIN` requiere rebuild del web**
  (son variables de build de Vite, quedan horneadas en el bundle):
  `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build web`
- **Facturama a producción**: cambia `FACTURAMA_SANDBOX=false` y reinicia el api.
- **Railway sigue disponible**: `DEPLOY.md` documenta esa alternativa; este
  archivo es la guía para VPS propio.
