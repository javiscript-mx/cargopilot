import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"

const CreateShipmentSchema = z.object({
  customerId: z.string().cuid(),
  origin: z.string().min(1),
  destination: z.string().min(1),
  cargo: z.object({
    description: z.string(),
    weight: z.number().positive().optional(),
    units: z.number().int().positive().optional(),
  }),
  notes: z.string().optional(),
})

export async function shipmentsRoutes(app: FastifyInstance) {
  app.get("/shipments", { preHandler: requireAuth }, async (request, reply) => {
    const shipments = await prisma.shipment.findMany({
      include: { customer: { select: { id: true, name: true, rfc: true } } },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(shipments)
  })

  app.get("/shipments/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      include: {
        customer: true,
        assignee: { select: { id: true, name: true, email: true } },
        invoices: true,
      },
    })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    return reply.send(shipment)
  })

  app.post(
    "/shipments",
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const body = CreateShipmentSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      const count = await prisma.shipment.count()
      const folio = `EXP-${String(count + 1).padStart(5, "0")}`

      const shipment = await prisma.shipment.create({
        data: {
          ...body.data,
          folio,
          notes: body.data.notes ?? null,
          assignedTo: request.session?.user.id ?? null,
        },
        include: { customer: { select: { id: true, name: true } } },
      })

      return reply.status(201).send(shipment)
    },
  )

  app.patch(
    "/shipments/:id/status",
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { status } = request.body as { status: string }

      const validStatuses = ["draft", "confirmed", "in_transit", "delivered", "cancelled"]
      if (!validStatuses.includes(status)) {
        return reply.status(400).send({ error: "Estado inválido" })
      }

      const shipment = await prisma.shipment.update({
        where: { id },
        data: { status: status as never },
      })

      return reply.send(shipment)
    },
  )
}
