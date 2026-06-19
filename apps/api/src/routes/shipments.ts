import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { withFolioRetry, folioNumber } from "../lib/folio.js"
import { parsePaging, setTotal, searchOr } from "../lib/pagination.js"
import { instantiateWorkflow } from "../lib/workflow.js"

const ShipmentSchema = z.object({
  customerId: z.string().cuid(),
  operationType: z.string().min(1), // catálogo service_type
  transportMode: z.string().nullish(), // catálogo transport_mode
  cargoType: z.string().nullish(), // catálogo cargo_type (modalidad de carga)
  origin: z.string().nullish(),
  destination: z.string().nullish(),
  reference: z.string().nullish(),
  cargo: z
    .object({
      description: z.string(),
      weight: z.number().positive().optional(),
      units: z.number().int().positive().optional(),
    })
    .nullish(),
  notes: z.string().nullish(),
  // Autotransporte (Carta Porte): unidad y operador subcontratados
  vehicleId: z.string().cuid().nullish(),
  operatorId: z.string().cuid().nullish(),
})

const EventSchema = z.object({
  type: z.enum(["milestone", "note"]),
  title: z.string().min(2),
  detail: z.string().nullish(),
  occurredAt: z.string().datetime({ offset: true }).or(z.string().datetime()).optional(),
})

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  confirmed: "Confirmado",
  in_transit: "En proceso",
  delivered: "Completado",
  cancelled: "Cancelado",
}

// Folio basado en el MÁXIMO existente (no en count): así no colisiona tras
// borrados ni reusa números. La carrera concurrente se cubre con withFolioRetry.
async function nextFolio(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "shipments.folioPrefix" } })
  const prefix = typeof setting?.value === "string" && setting.value.trim() ? setting.value.trim() : "EXP"
  const all = await prisma.shipment.findMany({ select: { folio: true } })
  const max = all.reduce((m, s) => Math.max(m, folioNumber(s.folio)), 0)
  return `${prefix}-${String(max + 1).padStart(5, "0")}`
}

export async function shipmentsRoutes(app: FastifyInstance) {
  app.get("/shipments", { preHandler: requireAuth }, async (request, reply) => {
    const include = { customer: { select: { id: true, name: true, rfc: true } } }
    const paging = parsePaging(request.query)
    if (!paging) {
      const shipments = await prisma.shipment.findMany({ include, orderBy: { createdAt: "desc" } })
      return reply.send(shipments)
    }
    const where = paging.search
      ? { OR: searchOr(paging.search, ["folio", "reference", "origin", "destination", "customer.name"]) }
      : {}
    const [total, shipments] = await prisma.$transaction([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.take }),
    ])
    setTotal(reply, total)
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
        events: { orderBy: { occurredAt: "desc" } },
        vehicle: { include: { supplier: { select: { id: true, name: true } } } },
        operator: { include: { supplier: { select: { id: true, name: true } } } },
      },
    })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    return reply.send(shipment)
  })

  app.post(
    "/shipments",
    { preHandler: requirePermission("shipments.write") },
    async (request, reply) => {
      const body = ShipmentSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

      const userId = request.session?.user.id ?? null

      const shipment = await withFolioRetry(async () =>
        prisma.shipment.create({
          data: {
            customerId: body.data.customerId,
            operationType: body.data.operationType,
            transportMode: body.data.transportMode ?? null,
            cargoType: body.data.cargoType ?? null,
            origin: body.data.origin ?? null,
            destination: body.data.destination ?? null,
            reference: body.data.reference ?? null,
            cargo: body.data.cargo ? (body.data.cargo as Prisma.InputJsonValue) : Prisma.JsonNull,
            notes: body.data.notes ?? null,
            vehicleId: body.data.vehicleId ?? null,
            operatorId: body.data.operatorId ?? null,
            folio: await nextFolio(),
            assignedTo: userId,
            events: {
              create: {
                type: "status_change",
                source: "system",
                title: "Expediente creado",
                createdBy: userId,
              },
            },
          },
          include: { customer: { select: { id: true, name: true } } },
        }),
      )

      // Auto-aplica el proceso si hay EXACTAMENTE un workflow activo para este tipo
      // de operación (p. ej. flete terrestre). Nunca bloquea el alta si algo falla.
      try {
        const templates = await prisma.workflowTemplate.findMany({
          where: { active: true, operationType: shipment.operationType },
          select: { code: true, name: true },
        })
        if (templates.length === 1 && templates[0]) {
          await instantiateWorkflow(shipment.id, templates[0].code)
        }
      } catch (err) {
        request.log.error({ err }, "No se pudo auto-aplicar el workflow al expediente")
      }

      return reply.status(201).send(shipment)
    },
  )

  app.put(
    "/shipments/:id",
    { preHandler: requirePermission("shipments.write") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = ShipmentSchema.partial().safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const shipment = await prisma.shipment.update({
        where: { id },
        data: {
          ...body.data,
          cargo: body.data.cargo !== undefined
            ? body.data.cargo ? (body.data.cargo as Prisma.InputJsonValue) : Prisma.JsonNull
            : undefined,
        },
        include: { customer: { select: { id: true, name: true } } },
      })
      return reply.send(shipment)
    },
  )

  app.patch(
    "/shipments/:id/status",
    { preHandler: requirePermission("shipments.changeStatus") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { status } = request.body as { status: string }

      const validStatuses = ["draft", "confirmed", "in_transit", "delivered", "cancelled"]
      if (!validStatuses.includes(status)) {
        return reply.status(400).send({ error: "Estado inválido" })
      }

      const current = await prisma.shipment.findUnique({ where: { id }, select: { status: true } })
      if (!current) return reply.status(404).send({ error: "Expediente no encontrado" })

      const shipment = await prisma.shipment.update({
        where: { id },
        data: {
          status: status as never,
          // Trazabilidad automática: cada cambio de estado queda en la bitácora
          events: {
            create: {
              type: "status_change",
              source: "system",
              title: `Estado: ${STATUS_LABELS[current.status]} → ${STATUS_LABELS[status]}`,
              createdBy: request.session?.user.id ?? null,
            },
          },
        },
      })

      return reply.send(shipment)
    },
  )

  // ── Bitácora de eventos ──────────────────────────────────────────────────

  app.post(
    "/shipments/:id/events",
    { preHandler: requirePermission("shipments.write") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = EventSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

      const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true } })
      if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })

      const event = await prisma.shipmentEvent.create({
        data: {
          shipmentId: id,
          type: body.data.type,
          title: body.data.title,
          detail: body.data.detail ?? null,
          occurredAt: body.data.occurredAt ? new Date(body.data.occurredAt) : new Date(),
          createdBy: request.session?.user.id ?? null,
        },
      })
      return reply.status(201).send(event)
    },
  )

  app.delete(
    "/shipments/:id/events/:eventId",
    { preHandler: requirePermission("shipments.delete") },
    async (request, reply) => {
      const { eventId } = request.params as { id: string; eventId: string }
      const event = await prisma.shipmentEvent.findUnique({ where: { id: eventId } })
      if (!event) return reply.status(404).send({ error: "Evento no encontrado" })
      if (event.type === "status_change" || event.source === "system") {
        return reply.status(400).send({ error: "Los eventos automáticos no se pueden eliminar" })
      }
      await prisma.shipmentEvent.delete({ where: { id: eventId } })
      return reply.status(204).send()
    },
  )
}
