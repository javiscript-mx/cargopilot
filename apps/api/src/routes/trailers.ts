import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

const TRAILER_STATUSES = ["pending", "authorized", "suspended"] as const

const TrailerSchema = z.object({
  supplierId: z.string().cuid(),
  plate: z.string().min(2).transform((s) => s.trim().toUpperCase()),
  subType: z.string().nullish(), // SubTipoRem (c_SubTipoRem SAT)
  notes: z.string().nullish(),
})

export async function trailersRoutes(app: FastifyInstance) {
  app.get("/trailers", { preHandler: requireAuth }, async (request, reply) => {
    const { supplierId, status, active } = request.query as {
      supplierId?: string; status?: string; active?: string
    }
    const trailers = await prisma.trailer.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status } : {}),
        ...(active !== undefined ? { active: active === "true" } : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(trailers)
  })

  app.post("/trailers", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const body = TrailerSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const supplier = await prisma.supplier.findUnique({ where: { id: body.data.supplierId } })
    if (!supplier) return reply.status(404).send({ error: "Proveedor no encontrado" })
    const trailer = await prisma.trailer.create({
      data: {
        supplierId: body.data.supplierId,
        plate: body.data.plate,
        subType: body.data.subType ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.status(201).send(trailer)
  })

  app.put("/trailers/:id", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = TrailerSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const trailer = await prisma.trailer.update({
      where: { id },
      data: {
        ...(body.data.plate !== undefined ? { plate: body.data.plate } : {}),
        ...(body.data.subType !== undefined ? { subType: body.data.subType ?? null } : {}),
        ...(body.data.notes !== undefined ? { notes: body.data.notes ?? null } : {}),
      },
    })
    return reply.send(trailer)
  })

  app.patch("/trailers/:id/status", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = (request.body ?? {}) as { status?: string }
    if (!status || !TRAILER_STATUSES.includes(status as (typeof TRAILER_STATUSES)[number])) {
      return reply.status(400).send({ error: "Estado inválido (pending, authorized, suspended)" })
    }
    const trailer = await prisma.trailer.update({ where: { id }, data: { status } })
    return reply.send(trailer)
  })

  app.delete("/trailers/:id", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.trailer.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
