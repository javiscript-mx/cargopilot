import type { FastifyInstance } from "fastify"
import { prisma } from "../db/client.js"

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])
const SENSITIVE = /pass(word)?|secret|token|otp|pin|authorization/i

// Redacta credenciales y trunca valores largos antes de persistir el cuerpo
function redact(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE.test(k)) out[k] = "***"
    else if (typeof v === "string" && v.length > 300) out[k] = `${v.slice(0, 300)}…`
    else out[k] = v
  }
  return JSON.stringify(out).length > 4000 ? { _truncated: true } : out
}

// Hook global: registra cada mutación (escritura/actualización/borrado) exitosa.
// No bloquea la respuesta (best-effort) y nunca guarda contraseñas.
export function registerAuditHook(app: FastifyInstance) {
  app.addHook("onResponse", async (request, reply) => {
    try {
      if (!MUTATING.has(request.method)) return
      if (reply.statusCode >= 400) return
      const url = (request.url.split("?")[0] ?? "")
      if (!url.startsWith("/api/")) return
      if (url.startsWith("/api/auth") || url.startsWith("/api/audit")) return

      const seg = url.split("/").filter(Boolean) // ["api","shipments","<id>",...]
      const params = (request.params ?? {}) as Record<string, string>
      const action = request.method === "DELETE" ? "delete" : request.method === "POST" ? "create" : "update"
      const user = request.session?.user as { id?: string; name?: string; email?: string } | undefined

      await prisma.auditLog.create({
        data: {
          userId: user?.id ?? null,
          userName: user?.name ?? null,
          userEmail: user?.email ?? null,
          userRole: request.authUser?.role ?? null,
          action,
          method: request.method,
          path: url,
          route: request.routeOptions?.url ?? null,
          entityType: seg[1] ?? null,
          entityId: params["id"] ?? params["expenseId"] ?? Object.values(params)[0] ?? null,
          statusCode: reply.statusCode,
          ip: request.ip ?? null,
          meta: (request.method !== "DELETE" ? redact(request.body) : undefined) as never,
        },
      })
    } catch (err) {
      request.log.warn(err, "No se pudo registrar auditoría")
    }
  })
}
