import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"

// Contenedor de un expediente (modalidad contenerizada) — nodo Contenedor de Carta Porte
const ContainerSchema = z.object({
  shipmentId: z.string().cuid(),
  number: z.string().min(1),
  type: z.string().nullish(),   // catálogo container_type
  seal: z.string().nullish(),   // sello / precinto
  tare: z.number().nonnegative().nullish(), // tara en kg
  notes: z.string().nullish(),
})

export async function containersRoutes(app: FastifyInstance) {
  app.get("/containers", { preHandler: requireAuth }, async (request, reply) => {
    const { shipmentId } = request.query as { shipmentId?: string }
    const items = await prisma.container.findMany({
      where: { ...(shipmentId ? { shipmentId } : {}) },
      orderBy: { createdAt: "asc" },
    })
    return reply.send(items)
  })

  app.post("/containers", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const body = ContainerSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const shipment = await prisma.shipment.findUnique({ where: { id: body.data.shipmentId } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    const item = await prisma.container.create({
      data: {
        shipmentId: body.data.shipmentId,
        number: body.data.number.trim().toUpperCase(),
        type: body.data.type ?? null,
        seal: body.data.seal ?? null,
        tare: body.data.tare ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.status(201).send(item)
  })

  app.put("/containers/:id", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ContainerSchema.omit({ shipmentId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const item = await prisma.container.update({
      where: { id },
      data: {
        number: body.data.number ? body.data.number.trim().toUpperCase() : undefined,
        type: body.data.type ?? null,
        seal: body.data.seal ?? null,
        tare: body.data.tare ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.send(item)
  })

  // Borra el contenedor; las mercancías asignadas quedan sin contenedor (SetNull)
  app.delete("/containers/:id", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.container.delete({ where: { id } })
    return reply.status(204).send()
  })
}
