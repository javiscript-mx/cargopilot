import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { authRoutes } from "./routes/auth.js"
import { usersRoutes } from "./routes/users.js"
import { customersRoutes } from "./routes/customers.js"
import { shipmentsRoutes } from "./routes/shipments.js"
import { invoicesRoutes } from "./routes/invoices.js"

const isDev = process.env["NODE_ENV"] === "development"

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
