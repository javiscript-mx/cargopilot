import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

// Partida de mercancía de un expediente — alimenta el nodo Mercancias de Carta Porte
const MerchandiseSchema = z.object({
  shipmentId: z.string().cuid(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitKey: z.string().nullish(),   // catálogo sat_unit_key (ClaveUnidad)
  weight: z.number().nonnegative().nullish(), // PesoEnKg
  value: z.number().nonnegative().nullish(),  // ValorMercancia
  productKey: z.string().nullish(), // catálogo sat_product_key (ClaveProdServCP)
  hsCode: z.string().nullish(),     // FraccionArancelaria
  containerId: z.string().cuid().nullish(), // asignación opcional a contenedor
  legId: z.string().cuid().nullish(),       // asignación opcional a tramo (Carta Porte)
  notes: z.string().nullish(),
})

export async function merchandiseRoutes(app: FastifyInstance) {
  app.get("/merchandise", { preHandler: requireAuth }, async (request, reply) => {
    const { shipmentId } = request.query as { shipmentId?: string }
    const items = await prisma.merchandise.findMany({
      where: { ...(shipmentId ? { shipmentId } : {}) },
      orderBy: { createdAt: "asc" },
    })
    return reply.send(items)
  })

  app.post("/merchandise", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const body = MerchandiseSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const shipment = await prisma.shipment.findUnique({ where: { id: body.data.shipmentId } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    const item = await prisma.merchandise.create({
      data: {
        shipmentId: body.data.shipmentId,
        description: body.data.description,
        quantity: body.data.quantity,
        unitKey: body.data.unitKey ?? null,
        weight: body.data.weight ?? null,
        value: body.data.value ?? null,
        productKey: body.data.productKey ?? null,
        hsCode: body.data.hsCode ?? null,
        containerId: body.data.containerId ?? null,
        legId: body.data.legId ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.status(201).send(item)
  })

  app.put("/merchandise/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = MerchandiseSchema.omit({ shipmentId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const item = await prisma.merchandise.update({
      where: { id },
      data: {
        description: body.data.description,
        quantity: body.data.quantity,
        unitKey: body.data.unitKey ?? null,
        weight: body.data.weight ?? null,
        value: body.data.value ?? null,
        productKey: body.data.productKey ?? null,
        hsCode: body.data.hsCode ?? null,
        containerId: body.data.containerId ?? null,
        legId: body.data.legId ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.send(item)
  })

  app.delete("/merchandise/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.merchandise.delete({ where: { id } })
    return reply.status(204).send()
  })
}
