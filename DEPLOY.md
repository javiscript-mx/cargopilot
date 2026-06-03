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
