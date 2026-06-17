# HM Sistema — Base de conocimiento técnico

## ¿Qué es este sistema?

Sistema de administración y operación para un negocio de **forwarding logístico** (agente de carga / freight forwarder). Gestiona el ciclo completo de operaciones: expedientes de envío, clientes, y facturación electrónica conforme al SAT mexicano (CFDI 4.0).

**Estado actual:** POC / MVP funcional con las siguientes capacidades:
- Autenticación y gestión de usuarios con roles (admin, operator, viewer)
- Catálogo de clientes con RFC
- Expedientes de envío con máquina de estados y línea de tiempo visual
- Facturación electrónica: crear borrador → timbrar vía Facturama → descargar PDF/XML
- UI responsiva (desktop + mobile) con sidebar colapsable

**Lo que NO está aún (pendiente):**
- Carta Porte (complemento CFDI para transporte)
- Portal de clientes / acceso por token
- Sistema de workflows configurables por usuario
- Módulo de reportes y analytics
- Notificaciones

---

## Stack tecnológico

### Monorepo
- **pnpm workspaces** — sin Turborepo (YAGNI en esta etapa)
- **TypeScript** en todo el stack
- **Node.js ≥ 20**

### Backend (`apps/api`)
| Tecnología | Versión | Rol |
|---|---|---|
| **Fastify v5** | `^5.0.0` | Framework HTTP |
| **Prisma** | `^5.22.0` | ORM + migraciones |
| **PostgreSQL** | 16 (Docker) | Base de datos |
| **better-auth** | `^1.0.0` | Autenticación (email/password + sesiones) |
| **Zod v4** | `^4.0.0` | Validación de schemas |
| **pino-pretty** | dev | Logger legible en desarrollo |
| **tsx** | dev | Ejecución TypeScript en desarrollo |

### Frontend (`apps/web`)
| Tecnología | Versión | Rol |
|---|---|---|
| **React 18** | `^18.3.0` | UI framework |
| **Vite 5** | `^5.3.0` | Bundler + dev server |
| **TanStack Router v1** | `^1.45.0` | Routing type-safe con file-based routes |
| **TanStack Query v5** | `^5.51.0` | Server state management |
| **Tailwind CSS v4** | `^4.0.0` | Estilos (via `@tailwindcss/vite`) |
| **better-auth/react** | `^1.0.0` | Cliente de autenticación |
| **lucide-react** | `^0.400.0` | Iconos |

### Paquete compartido (`packages/shared`)
- Schemas Zod compartidos entre API y Web
- Tipos TypeScript: `UserResponse`, `CreateUserInput`, `LoginInput`, `Role`, `Pagination`

### Integración externa
- **Facturama** — PAC para timbrado CFDI 4.0. Credenciales vía `FACTURAMA_USER` / `FACTURAMA_PASSWORD`. Sandbox disponible con `FACTURAMA_SANDBOX=true`

### Deploy
- **Railway** — un servicio por app (api + web) + addon PostgreSQL
- Cada app tiene `Dockerfile` multi-stage: `deps → builder → production`
- `docker-compose.yml` en raíz para desarrollo local

---

## Estructura del repositorio

```
hm-sistema/
├── apps/
│   ├── api/                        ← Backend Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma       ← Modelos: User, Session, Account, Verification,
│   │   │   │                         Customer, Shipment, Invoice
│   │   │   └── migrations/         ← Migraciones SQL generadas por Prisma
│   │   ├── src/
│   │   │   ├── index.ts            ← Entry point: registra plugins y rutas
│   │   │   ├── lib/
│   │   │   │   ├── auth.ts         ← Configuración de better-auth
│   │   │   │   └── facturama.ts    ← Cliente HTTP para Facturama API
│   │   │   ├── middleware/
│   │   │   │   └── require-auth.ts ← Guards: requireAuth, requireRole(...)
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts         ← Proxy a better-auth handler (/api/auth/*)
│   │   │   │   ├── users.ts        ← GET/POST /users, PATCH /users/:id/role
│   │   │   │   ├── customers.ts    ← CRUD /customers
│   │   │   │   ├── shipments.ts    ← CRUD /shipments + PATCH status
│   │   │   │   └── invoices.ts     ← /invoices: crear, timbrar, cancelar, PDF
│   │   │   └── db/
│   │   │       ├── client.ts       ← Singleton de PrismaClient
│   │   │       └── seed.ts         ← Admin inicial + cliente de prueba
│   │   ├── .env                    ← Variables locales (no en git)
│   │   ├── .env.example
│   │   └── Dockerfile              ← Multi-stage: development / builder / production
│   │
│   └── web/                        ← Frontend React
│       ├── src/
│       │   ├── main.tsx            ← Entry point: QueryClient + RouterProvider
│       │   ├── index.css           ← Tailwind v4 + @theme con variables CSS
│       │   ├── api/                ← Módulos de llamadas al API por dominio
│       │   │   ├── users.ts
│       │   │   ├── customers.ts
│       │   │   ├── shipments.ts
│       │   │   └── invoices.ts
│       │   ├── lib/
│       │   │   ├── api-client.ts   ← fetch wrapper con credentials + error handling
│       │   │   ├── auth-client.ts  ← better-auth/react client
│       │   │   └── utils.ts        ← cn() helper (clsx + tailwind-merge)
│       │   ├── components/
│       │   │   ├── layout.tsx      ← AppLayout: sidebar colapsable + mobile drawer
│       │   │   ├── ui/             ← Componentes base (sin dependencia externa)
│       │   │   │   ├── button.tsx
│       │   │   │   ├── input.tsx
│       │   │   │   ├── select.tsx
│       │   │   │   ├── card.tsx
│       │   │   │   ├── badge.tsx
│       │   │   │   └── dialog.tsx  ← Modal reutilizable (solo para StampDialog)
│       │   │   ├── invoices/
│       │   │   │   └── stamp-dialog.tsx  ← Confirmación antes de timbrar
│       │   └── routes/             ← File-based routing (TanStack Router)
│       │       ├── __root.tsx      ← Guard de auth global (beforeLoad + timeout 3s)
│       │       ├── login.tsx
│       │       ├── index.tsx       ← Dashboard con stats
│       │       ├── shipments.tsx   ← Layout (solo <Outlet />)
│       │       ├── shipments.index.tsx   ← Lista de expedientes
│       │       ├── shipments.new.tsx     ← Formulario nuevo expediente
│       │       ├── shipments.$id.tsx     ← Detalle + cambio de estado + timeline
│       │       ├── customers.tsx   ← Layout
│       │       ├── customers.index.tsx
│       │       ├── customers.new.tsx
│       │       ├── invoices.tsx    ← Layout
│       │       ├── invoices.index.tsx
│       │       ├── invoices.new.tsx      ← Formulario con conceptos + totales
│       │       └── users.tsx
│       ├── nginx.conf              ← SPA fallback + cache de assets
│       └── Dockerfile
│
├── packages/
│   └── shared/                     ← Tipos y schemas compartidos
│       └── src/
│           ├── index.ts
│           └── schemas/
│               ├── auth.ts         ← LoginSchema, CreateUserSchema, UserResponseSchema
│               └── common.ts       ← PaginationSchema, IdParamSchema, ROLES, Role
│
├── docker-compose.yml              ← postgres + api + web para desarrollo
├── .env.example                    ← Variables de entorno raíz (Facturama)
├── railway.json                    ← Config Railway raíz
├── DEPLOY.md                       ← Guía de deploy en Railway
└── CLAUDE.md                       ← Este archivo
```

---

## Modelo de datos (Prisma)

### Tablas de autenticación (better-auth)
- **User** — id, name, email, role (admin|operator|viewer), emailVerified
- **Session** — token, expiresAt, userId
- **Account** — para OAuth futuro
- **Verification** — para verificación de email futura

### Tablas del negocio
- **Customer** — name, rfc (unique), email, phone, address (JSON)
- **Shipment** — folio (EXP-00001), status (draft→confirmed→in_transit→delivered|cancelled), origin, destination, cargo (JSON), customerId, assignedTo
- **Invoice** — series+folio (unique), status (draft→stamped|cancelled), subtotal/tax/total (Decimal), cfdiUse, xmlContent, facturamaid, stampedAt, customerId, shipmentId?

---

## API endpoints

Todos bajo prefijo `/api`. Autenticación via cookie de sesión (better-auth).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| ALL | `/api/auth/*` | — | better-auth handler |
| GET | `/api/users` | admin | Listar usuarios |
| POST | `/api/users` | admin | Crear usuario |
| PATCH | `/api/users/:id/role` | admin | Cambiar rol |
| GET | `/api/customers` | any | Listar clientes |
| POST | `/api/customers` | admin/operator | Crear cliente |
| PUT | `/api/customers/:id` | admin/operator | Editar cliente |
| GET | `/api/shipments` | any | Listar expedientes |
| POST | `/api/shipments` | admin/operator | Crear expediente |
| PATCH | `/api/shipments/:id/status` | admin/operator | Cambiar estado |
| GET | `/api/invoices` | any | Listar facturas |
| POST | `/api/invoices` | admin/operator | Crear borrador |
| POST | `/api/invoices/:id/stamp` | admin/operator | Timbrar con Facturama |
| POST | `/api/invoices/:id/cancel` | admin | Cancelar CFDI |
| GET | `/api/invoices/:id/pdf` | any | Descargar PDF |
| GET | `/health` | — | Health check |
| GET | `/docs` | — | Swagger UI |

---

## Variables de entorno (API)

```env
DATABASE_URL                # postgresql://hm:hm_dev_password@localhost:5432/hm_sistema
BETTER_AUTH_SECRET          # string aleatorio ≥32 chars
BETTER_AUTH_URL             # URL base del API (ej: http://localhost:3001)
FACTURAMA_USER              # usuario Facturama
FACTURAMA_PASSWORD          # password Facturama
FACTURAMA_SANDBOX           # "true" en desarrollo
EMISOR_CP                   # código postal del emisor (para CFDI)
CORS_ORIGIN                 # URL del frontend (ej: http://localhost:5173)
NODE_ENV                    # development | production
PORT                        # 3001
ADMIN_SEED_PASSWORD         # password del usuario admin inicial
```

---

## Levantar ambiente local

```bash
# 1. Clonar e instalar dependencias
pnpm install

# 2. Levantar PostgreSQL
docker compose up postgres -d

# 3. Configurar entorno del API
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env con los valores correctos

# 4. Migraciones y seed (primera vez)
pnpm --filter @hm/api db:migrate
pnpm --filter @hm/api db:seed

# 5. Desarrollo (dos terminales desde la raíz)
pnpm --filter @hm/api dev    # http://localhost:3001
pnpm --filter @hm/web dev    # http://localhost:5173 (o 5174/5175 si hay conflicto)
```

**Credenciales iniciales:** `admin@hmsistema.mx` / `Admin1234!`

---

## Decisiones técnicas relevantes

### Por qué estas tecnologías
- **Fastify v5** sobre Express: mejor performance, validación nativa, soporte TypeScript superior
- **Prisma** sobre Drizzle/TypeORM: DX superior, migraciones declarativas, type-safety end-to-end
- **better-auth** sobre Auth.js/JWT manual: manejo completo de sesiones, roles custom, sin vendor lock-in
- **TanStack Router** sobre React Router: type-safety completa en params y search params, file-based routing
- **Tailwind v4** con `@theme`: variables CSS nativas, sin configuración extra
- **REST + OpenAPI** sobre tRPC: interoperabilidad total (mobile, webhooks, terceros)

### Convenciones de código
- `exactOptionalPropertyTypes: false` en API y Web (Prisma y better-auth no son compatibles con `true`)
- Campos nullable en Prisma requieren `?? null` explícito (no `undefined`)
- `declaration: false` en web tsconfig (no es librería, evita errores de tipos internos de pnpm)
- Componentes UI en `src/components/ui/` son propios (no shadcn instalado como dependencia)
- Formularios largos = páginas dedicadas (`/entity/new`), NO modales
- Modales solo para acciones puntuales de confirmación (ej: timbrar)

### Estructura de rutas TanStack Router
Para rutas con subrutas se requiere el patrón layout + index:
```
entity.tsx          → layout (solo <Outlet />) — necesario para que funcionen hijos
entity.index.tsx    → lista en /entity
entity.new.tsx      → formulario en /entity/new
entity.$id.tsx      → detalle en /entity/:id
```
Sin el layout, los hijos se renderizan dentro del padre sin `<Outlet />` y no aparecen.

### Autenticación
- better-auth maneja sesiones via cookies HttpOnly
- El guard en `__root.tsx` llama `getSession()` con timeout de 3 segundos para no bloquear el router si el API no responde
- `trustedOrigins` en `auth.ts` debe incluir TODOS los puertos donde corra el frontend
- Los roles se almacenan en `User.role` como campo adicional de better-auth

### Facturama (timbrado CFDI)
- Flujo: crear factura borrador (DB) → llamar `POST /invoices/:id/stamp` → API llama a Facturama → guarda `facturamaid` y XML
- El XML se descarga en background (no bloquea la respuesta de stamp)
- En sandbox usar `FACTURAMA_SANDBOX=true` con credenciales de prueba de Facturama
- Clave de producto por defecto: `78101800` (Transporte de carga general)
- Clave de unidad por defecto: `E48` (Unidad de servicio)

---

## Próximos pasos naturales

1. **Complemento Carta Porte** — agregar al flujo de facturación para transporte terrestre
2. **Edición de expedientes y clientes** — rutas `/entity/:id/edit`
3. **Paginación en listas** — el API ya tiene `PaginationSchema` en `@hm/shared`
4. **Portal de clientes** — acceso de consulta con token (sin login completo)
5. **Módulo de usuarios en UI** — crear/editar usuarios desde la interfaz (el API ya lo soporta)
6. **Workflow engine** — estados y transiciones configurables por el usuario
7. **Analytics / reportes** — servicio Python separado en el monorepo (`apps/analytics`)
8. **App mobile** — Expo + React Native, reutiliza `packages/shared` y el mismo API REST
