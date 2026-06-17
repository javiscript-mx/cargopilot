import type { FastifyInstance } from "fastify"
import { prisma } from "../db/client.js"
import { requireAuth } from "../middleware/require-auth.js"

// Búsqueda en los catálogos SAT grandes (clave producto/servicio y clave unidad).
// Devuelve un tope de resultados — son tablas de decenas de miles de filas.
const LIMIT = 25

export async function satRoutes(app: FastifyInstance) {
  // GET /api/sat/prodserv?q=...  o  ?code=... (resolver una clave exacta)
  app.get("/sat/prodserv", { preHandler: requireAuth }, async (request, reply) => {
    const { q, code } = request.query as { q?: string; code?: string }
    if (code) {
      const item = await prisma.satProductKey.findUnique({ where: { code } })
      return reply.send(item ? [item] : [])
    }
    const term = (q ?? "").trim()
    if (term.length < 2) return reply.send([])
    const items = await prisma.satProductKey.findMany({
      where: { OR: [{ code: { startsWith: term } }, { description: { contains: term, mode: "insensitive" } }] },
      orderBy: { code: "asc" },
      take: LIMIT,
    })
    return reply.send(items)
  })

  // GET /api/sat/unidades?q=...  o  ?code=...
  app.get("/sat/unidades", { preHandler: requireAuth }, async (request, reply) => {
    const { q, code } = request.query as { q?: string; code?: string }
    if (code) {
      const item = await prisma.satUnitKey.findUnique({ where: { code } })
      return reply.send(item ? [item] : [])
    }
    const term = (q ?? "").trim()
    if (term.length < 1) return reply.send([])
    const items = await prisma.satUnitKey.findMany({
      where: { OR: [{ code: { startsWith: term.toUpperCase() } }, { name: { contains: term, mode: "insensitive" } }] },
      orderBy: { code: "asc" },
      take: LIMIT,
    })
    return reply.send(items)
  })
}
