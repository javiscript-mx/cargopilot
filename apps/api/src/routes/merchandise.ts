import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { deriveMerchStatus } from "../lib/merchandise-status.js"

// Partida de mercancía de un expediente — alimenta el nodo Mercancias de Carta Porte.
// La asignación a tramos vive en `legAssignments` (una partida puede viajar en varios tramos);
// el `status` se DERIVA del progreso de esos tramos (no se captura a mano).
const MerchandiseSchema = z.object({
  shipmentId: z.string().cuid(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitKey: z.string().nullish(),
  weight: z.number().nonnegative().nullish(),
  value: z.number().nonnegative().nullish(),
  productKey: z.string().nullish(),
  hsCode: z.string().nullish(),
  containerId: z.string().cuid().nullish(),
  legAssignments: z.array(z.object({
    legId: z.string().cuid(),
    legVehicleId: z.string().cuid().nullish(),
  })).optional(),
  notes: z.string().nullish(),
})

// Dedup por legId (la UI puede mandar duplicados); última gana
function normalizeAssignments(a?: { legId: string; legVehicleId?: string | null }[]) {
  const byLeg = new Map<string, string | null>()
  for (const x of a ?? []) byLeg.set(x.legId, x.legVehicleId ?? null)
  return [...byLeg.entries()].map(([legId, legVehicleId]) => ({ legId, legVehicleId }))
}

const withLegProgress = { include: { legAssignments: { include: { leg: { select: { order: true, actualPickupAt: true, actualDeliveryAt: true } } } } } }

// Serializa la partida con su status derivado + asignaciones planas
function serialize(m: Awaited<ReturnType<typeof loadOne>>) {
  if (!m) return m
  const status = deriveMerchStatus(m.legAssignments.map((x) => x.leg))
  const legAssignments = m.legAssignments.map((x) => ({ legId: x.legId, legVehicleId: x.legVehicleId }))
  // legId/legVehicleId planos = primera asignación (compat con lecturas viejas)
  const first = legAssignments[0]
  return { ...m, status, legAssignments, legId: first?.legId ?? null, legVehicleId: first?.legVehicleId ?? null }
}
function loadOne(id: string) {
  return prisma.merchandise.findUnique({ where: { id }, ...withLegProgress })
}

async function syncAssignments(merchandiseId: string, assignments: { legId: string; legVehicleId: string | null }[]) {
  await prisma.merchandiseLeg.deleteMany({ where: { merchandiseId } })
  if (assignments.length) {
    await prisma.merchandiseLeg.createMany({ data: assignments.map((a) => ({ merchandiseId, legId: a.legId, legVehicleId: a.legVehicleId })) })
  }
  // Mantén legId/legVehicleId planos sincronizados con la primera asignación (compat)
  const first = assignments[0]
  await prisma.merchandise.update({ where: { id: merchandiseId }, data: { legId: first?.legId ?? null, legVehicleId: first?.legVehicleId ?? null } })
}

export async function merchandiseRoutes(app: FastifyInstance) {
  app.get("/merchandise", { preHandler: requireAuth }, async (request, reply) => {
    const { shipmentId } = request.query as { shipmentId?: string }
    const items = await prisma.merchandise.findMany({
      where: { ...(shipmentId ? { shipmentId } : {}) },
      orderBy: { createdAt: "asc" },
      ...withLegProgress,
    })
    return reply.send(items.map((m) => serialize(m)))
  })

  app.post("/merchandise", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const body = MerchandiseSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const shipment = await prisma.shipment.findUnique({ where: { id: body.data.shipmentId } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    const d = body.data
    const created = await prisma.merchandise.create({
      data: {
        shipmentId: d.shipmentId,
        description: d.description,
        quantity: d.quantity,
        unitKey: d.unitKey ?? null,
        weight: d.weight ?? null,
        value: d.value ?? null,
        productKey: d.productKey ?? null,
        hsCode: d.hsCode ?? null,
        containerId: d.containerId ?? null,
        notes: d.notes ?? null,
      },
    })
    await syncAssignments(created.id, normalizeAssignments(d.legAssignments))
    return reply.status(201).send(serialize(await loadOne(created.id)))
  })

  app.put("/merchandise/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = MerchandiseSchema.omit({ shipmentId: true }).partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    await prisma.merchandise.update({
      where: { id },
      data: {
        description: d.description,
        quantity: d.quantity,
        unitKey: d.unitKey ?? null,
        weight: d.weight ?? null,
        value: d.value ?? null,
        productKey: d.productKey ?? null,
        hsCode: d.hsCode ?? null,
        containerId: d.containerId ?? null,
        notes: d.notes ?? null,
      },
    })
    if (d.legAssignments !== undefined) await syncAssignments(id, normalizeAssignments(d.legAssignments))
    return reply.send(serialize(await loadOne(id)))
  })

  app.delete("/merchandise/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.merchandise.delete({ where: { id } })
    return reply.status(204).send()
  })
}
