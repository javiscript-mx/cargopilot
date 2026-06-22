import type { FastifyInstance } from "fastify"
import type { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requirePermission } from "../middleware/require-auth.js"
import { parsePaging, setTotal } from "../lib/pagination.js"

// Bitácora de auditoría — solo lectura, admin (audit.read). Inmutable: no hay write/delete.
export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit", { preHandler: requirePermission("audit.read") }, async (request, reply) => {
    const q = request.query as {
      userId?: string; entityType?: string; action?: string; from?: string; to?: string; search?: string
      page?: string; pageSize?: string
    }
    const range = (v?: string, end = false) => (v ? new Date(end ? `${v}T23:59:59.999Z` : `${v}T00:00:00.000Z`) : undefined)
    const gte = range(q.from), lte = range(q.to, true)

    const where: Prisma.AuditLogWhereInput = {
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(gte || lte ? { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } } : {}),
      ...(q.search ? { OR: [
        { userName: { contains: q.search, mode: "insensitive" } },
        { userEmail: { contains: q.search, mode: "insensitive" } },
        { path: { contains: q.search, mode: "insensitive" } },
      ] } : {}),
    }

    const paging = parsePaging(q)
    if (!paging) {
      // Sin paginación explícita: últimos 200 (para no traer todo)
      const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 })
      return reply.send(rows)
    }
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.take }),
      prisma.auditLog.count({ where }),
    ])
    setTotal(reply, total)
    return reply.send(rows)
  })
}
