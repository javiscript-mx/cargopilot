import type { FastifyInstance } from "fastify"
import { prisma } from "../db/client.js"
import { requireAuth } from "../middleware/require-auth.js"

// Búsqueda en los catálogos SAT grandes (clave producto/servicio y clave unidad).
// Devuelve un tope de resultados — son tablas de decenas de miles de filas.
const LIMIT = 25

export async function satRoutes(app: FastifyInstance) {
  // Rango de claves que corresponden a BIENES TANGIBLES (mercancía transportable).
  // El catálogo c_ClaveProdServ es UNSPSC: segmentos 10–63 = bienes; 64 = instrumentos
  // financieros (intangible); 70–95 = servicios. Para Carta Porte la mercancía debe ser
  // un bien, no un servicio → se filtra por rango lexicográfico del código (8 dígitos).
  const GOODS_MIN = "10000000"
  const GOODS_MAX = "64000000" // exclusivo (deja fuera 64+ y todos los servicios)

  // GET /api/sat/prodserv?q=...  o  ?code=...  (?goods=1 → solo bienes, sin servicios)
  app.get("/sat/prodserv", { preHandler: requireAuth }, async (request, reply) => {
    const { q, code, goods } = request.query as { q?: string; code?: string; goods?: string }
    if (code) {
      const item = await prisma.satProductKey.findUnique({ where: { code } })
      return reply.send(item ? [item] : [])
    }
    const term = (q ?? "").trim()
    if (term.length < 2) return reply.send([])
    const goodsOnly = goods === "1" || goods === "true"
    const items = await prisma.satProductKey.findMany({
      where: {
        AND: [
          { OR: [{ code: { startsWith: term } }, { description: { contains: term, mode: "insensitive" } }] },
          ...(goodsOnly ? [{ code: { gte: GOODS_MIN, lt: GOODS_MAX } }] : []),
        ],
      },
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
