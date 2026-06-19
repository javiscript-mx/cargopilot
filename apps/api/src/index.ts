import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import multipart from "@fastify/multipart"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { authRoutes } from "./routes/auth.js"
import { usersRoutes } from "./routes/users.js"
import { customersRoutes } from "./routes/customers.js"
import { shipmentsRoutes } from "./routes/shipments.js"
import { invoicesRoutes } from "./routes/invoices.js"
import { settingsRoutes } from "./routes/settings.js"
import { suppliersRoutes } from "./routes/suppliers.js"
import { catalogRoutes } from "./routes/catalog.js"
import { documentsRoutes } from "./routes/documents.js"
import { vehiclesRoutes } from "./routes/vehicles.js"
import { operatorsRoutes } from "./routes/operators.js"
import { merchandiseRoutes } from "./routes/merchandise.js"
import { containersRoutes } from "./routes/containers.js"
import { satRoutes } from "./routes/sat.js"
import { processRoutes } from "./routes/process.js"

const isDev = process.env["NODE_ENV"] === "development"

// ─── Guard de entorno: en producción no arrancar con secretos faltantes/débiles.
// Sin BETTER_AUTH_SECRET, better-auth genera uno aleatorio por proceso → cierra
// la sesión de todos en cada reinicio/deploy. DATABASE_URL es obligatorio.
if (!isDev) {
  const problems: string[] = []
  const secret = process.env["BETTER_AUTH_SECRET"] ?? ""
  if (!process.env["DATABASE_URL"]) problems.push("DATABASE_URL no está definido")
  if (secret.length < 32) problems.push("BETTER_AUTH_SECRET debe tener al menos 32 caracteres")
  if (!process.env["BETTER_AUTH_URL"]) problems.push("BETTER_AUTH_URL no está definido")
  if (!process.env["CORS_ORIGIN"]) problems.push("CORS_ORIGIN no está definido")
  if (problems.length) {
    console.error("✖ Configuración de producción incompleta:\n  - " + problems.join("\n  - "))
    process.exit(1)
  }
}

const app = Fastify({
  logger: isDev
    ? { level: process.env["LOG_LEVEL"] ?? "info", transport: { target: "pino-pretty", options: { colorize: true } } }
    : { level: process.env["LOG_LEVEL"] ?? "info" },
})

// ─── Plugins ─────────────────────────────────────────────────────────────────

await app.register(helmet, { contentSecurityPolicy: false })

await app.register(cors, {
  origin: process.env["CORS_ORIGIN"] ?? "http://localhost:5173",
  credentials: true,
  exposedHeaders: ["X-Total-Count"], // para que el front lea el total paginado
})

await app.register(multipart, {
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
})

await app.register(swagger, {
  openapi: {
    info: { title: "HM Sistema API", version: "0.1.0" },
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "better-auth.session_token" },
      },
    },
  },
})

await app.register(swaggerUi, { routePrefix: "/docs" })

// ─── Routes ──────────────────────────────────────────────────────────────────

await app.register(authRoutes)
await app.register(usersRoutes, { prefix: "/api" })
await app.register(customersRoutes, { prefix: "/api" })
await app.register(shipmentsRoutes, { prefix: "/api" })
await app.register(invoicesRoutes, { prefix: "/api" })
await app.register(settingsRoutes, { prefix: "/api" })
await app.register(suppliersRoutes, { prefix: "/api" })
await app.register(catalogRoutes, { prefix: "/api" })
await app.register(documentsRoutes, { prefix: "/api" })
await app.register(vehiclesRoutes, { prefix: "/api" })
await app.register(operatorsRoutes, { prefix: "/api" })
await app.register(merchandiseRoutes, { prefix: "/api" })
await app.register(containersRoutes, { prefix: "/api" })
await app.register(satRoutes, { prefix: "/api" })
await app.register(processRoutes, { prefix: "/api" })

// ─── Health check ────────────────────────────────────────────────────────────

app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }))

// ─── Start ───────────────────────────────────────────────────────────────────

const port = Number(process.env["PORT"] ?? 3001)
const host = process.env["HOST"] ?? "0.0.0.0"

try {
  await app.listen({ port, host })
  console.log(`API corriendo en http://${host}:${port}`)
  console.log(`Docs en http://${host}:${port}/docs`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
