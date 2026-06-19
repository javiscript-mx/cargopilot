import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { instantiateWorkflow, addLeg } from "../lib/workflow.js"

// ─── Proceso / workflow del expediente (fases, tareas y tramos) ──────────────

const TaskUpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "done", "skipped", "blocked"]).optional(),
  assigneeUserId: z.string().nullish(),
  supplierId: z.string().nullish(),
  plannedAt: z.string().datetime().nullish(),
  actualAt: z.string().datetime().nullish(),
  notes: z.string().nullish(),
})
type TaskUpdate = z.infer<typeof TaskUpdateSchema>

const LegUpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
  origin: z.record(z.string(), z.unknown()).nullish(),
  destination: z.record(z.string(), z.unknown()).nullish(),
  distanceKm: z.number().nonnegative().nullish(),
  carrierSupplierId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  operatorId: z.string().nullish(),
  plannedPickupAt: z.string().datetime().nullish(),
  actualPickupAt: z.string().datetime().nullish(),
  plannedDeliveryAt: z.string().datetime().nullish(),
  actualDeliveryAt: z.string().datetime().nullish(),
  cartaPorteInvoiceId: z.string().nullish(),
  notes: z.string().nullish(),
})

const toDate = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v === null ? null : new Date(v)

async function logEvent(shipmentId: string, type: string, title: string, userId: string | null, occurredAt?: Date) {
  await prisma.shipmentEvent.create({
    data: { shipmentId, type, title, occurredAt: occurredAt ?? new Date(), createdBy: userId },
  })
}

interface ExistingTask { status: string; isMilestone: boolean; name: string; shipmentId: string; actualAt: Date | null }

// Construye el `data` del update y decide si la tarea pasó a "done" (para bitácora).
function buildTaskUpdate(existing: ExistingTask, body: TaskUpdate) {
  const data: Prisma.ShipmentTaskUpdateInput & Prisma.LegTaskUpdateInput = {}
  if (body.status !== undefined) data.status = body.status
  if (body.assigneeUserId !== undefined) data.assigneeUserId = body.assigneeUserId
  if (body.supplierId !== undefined) data.supplierId = body.supplierId
  if (body.notes !== undefined) data.notes = body.notes
  if (body.plannedAt !== undefined) data.plannedAt = toDate(body.plannedAt)
  if (body.actualAt !== undefined) data.actualAt = toDate(body.actualAt)

  const becameDone = body.status === "done" && existing.status !== "done"
  if (becameDone) {
    data.completedAt = new Date()
    // Para hitos, la "fecha real" por defecto es ahora si no se especificó
    if (existing.isMilestone && body.actualAt === undefined && !existing.actualAt) data.actualAt = new Date()
  }
  if (body.status !== undefined && body.status !== "done" && existing.status === "done") {
    data.completedAt = null
  }
  return { data, becameDone }
}

export async function processRoutes(app: FastifyInstance) {
  // Plantillas disponibles (para el selector al aplicar un proceso)
  app.get("/workflow-templates", { preHandler: requireAuth }, async (_request, reply) => {
    const templates = await prisma.workflowTemplate.findMany({
      where: { active: true },
      select: { code: true, name: true, operationType: true, description: true },
      orderBy: { name: "asc" },
    })
    return reply.send(templates)
  })

  // Proceso completo de un expediente: fases+tareas y tramos+tareas
  app.get("/shipments/:id/process", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const shipment = await prisma.shipment.findUnique({
      where: { id },
      select: { id: true, workflowTemplateId: true },
    })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })

    const [stages, legs] = await Promise.all([
      prisma.shipmentStage.findMany({
        where: { shipmentId: id },
        orderBy: { order: "asc" },
        include: { tasks: { orderBy: { order: "asc" } } },
      }),
      prisma.shipmentLeg.findMany({
        where: { shipmentId: id },
        orderBy: { order: "asc" },
        include: { tasks: { orderBy: { order: "asc" } } },
      }),
    ])

    // Resuelve nombres de transportista/unidad/operador (soft refs) en lote para
    // mostrarlos en cada tramo sin queries por fila en el cliente.
    const ids = (key: "carrierSupplierId" | "vehicleId" | "operatorId") =>
      [...new Set(legs.map((l) => l[key]).filter((v): v is string => Boolean(v)))]
    const [sups, vehs, ops] = await Promise.all([
      prisma.supplier.findMany({ where: { id: { in: ids("carrierSupplierId") } }, select: { id: true, name: true } }),
      prisma.vehicle.findMany({ where: { id: { in: ids("vehicleId") } }, select: { id: true, plates: true, economicNumber: true } }),
      prisma.operator.findMany({ where: { id: { in: ids("operatorId") } }, select: { id: true, name: true } }),
    ])
    const supMap = new Map(sups.map((s) => [s.id, s.name]))
    const vehMap = new Map(vehs.map((v) => [v.id, v.economicNumber ? `${v.plates} · ${v.economicNumber}` : v.plates]))
    const opMap = new Map(ops.map((o) => [o.id, o.name]))
    const legsEnriched = legs.map((l) => ({
      ...l,
      carrierName: l.carrierSupplierId ? supMap.get(l.carrierSupplierId) ?? null : null,
      vehicleLabel: l.vehicleId ? vehMap.get(l.vehicleId) ?? null : null,
      operatorName: l.operatorId ? opMap.get(l.operatorId) ?? null : null,
    }))

    return reply.send({ workflowTemplateId: shipment.workflowTemplateId, stages, legs: legsEnriched })
  })

  // Aplica (instancia) una plantilla de workflow al expediente — copia-snapshot
  app.post("/shipments/:id/workflow", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({ templateCode: z.string().min(1) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })

    const template = await prisma.workflowTemplate.findUnique({ where: { code: body.data.templateCode }, select: { name: true } })
    if (!template) return reply.status(404).send({ error: "Plantilla no encontrada" })

    await instantiateWorkflow(id, body.data.templateCode)
    await logEvent(id, "note", `Proceso aplicado: ${template.name}`, request.session?.user.id ?? null)

    const stages = await prisma.shipmentStage.findMany({
      where: { shipmentId: id },
      orderBy: { order: "asc" },
      include: { tasks: { orderBy: { order: "asc" } } },
    })
    return reply.status(201).send({ stages })
  })

  // ── Tramos ─────────────────────────────────────────────────────────────────

  app.post("/shipments/:id/legs", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      scope: z.enum(["local", "foraneo"]),
      legTemplateCode: z.string().optional(),
    }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })

    const leg = await addLeg(id, { scope: body.data.scope, ...(body.data.legTemplateCode ? { legTemplateCode: body.data.legTemplateCode } : {}) })
    await logEvent(id, "note", `Tramo ${body.data.scope === "local" ? "local" : "foráneo"} agregado`, request.session?.user.id ?? null)
    return reply.status(201).send(leg)
  })

  app.patch("/legs/:legId", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { legId } = request.params as { legId: string }
    const body = LegUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data

    const existing = await prisma.shipmentLeg.findUnique({ where: { id: legId }, select: { id: true } })
    if (!existing) return reply.status(404).send({ error: "Tramo no encontrado" })

    const leg = await prisma.shipmentLeg.update({
      where: { id: legId },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.origin !== undefined ? { origin: d.origin === null ? Prisma.JsonNull : (d.origin as Prisma.InputJsonValue) } : {}),
        ...(d.destination !== undefined ? { destination: d.destination === null ? Prisma.JsonNull : (d.destination as Prisma.InputJsonValue) } : {}),
        ...(d.distanceKm !== undefined ? { distanceKm: d.distanceKm } : {}),
        ...(d.carrierSupplierId !== undefined ? { carrierSupplierId: d.carrierSupplierId } : {}),
        ...(d.vehicleId !== undefined ? { vehicleId: d.vehicleId } : {}),
        ...(d.operatorId !== undefined ? { operatorId: d.operatorId } : {}),
        ...(d.plannedPickupAt !== undefined ? { plannedPickupAt: toDate(d.plannedPickupAt) } : {}),
        ...(d.actualPickupAt !== undefined ? { actualPickupAt: toDate(d.actualPickupAt) } : {}),
        ...(d.plannedDeliveryAt !== undefined ? { plannedDeliveryAt: toDate(d.plannedDeliveryAt) } : {}),
        ...(d.actualDeliveryAt !== undefined ? { actualDeliveryAt: toDate(d.actualDeliveryAt) } : {}),
        ...(d.cartaPorteInvoiceId !== undefined ? { cartaPorteInvoiceId: d.cartaPorteInvoiceId } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      },
      include: { tasks: { orderBy: { order: "asc" } } },
    })
    return reply.send(leg)
  })

  app.delete("/legs/:legId", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { legId } = request.params as { legId: string }
    const existing = await prisma.shipmentLeg.findUnique({ where: { id: legId }, select: { id: true } })
    if (!existing) return reply.status(404).send({ error: "Tramo no encontrado" })
    await prisma.shipmentLeg.delete({ where: { id: legId } })
    return reply.status(204).send()
  })

  // ── Tareas (de fase y de tramo) ─────────────────────────────────────────────

  app.patch("/shipment-tasks/:taskId", { preHandler: requirePermission("shipments.advanceTask") }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = TaskUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.shipmentTask.findUnique({ where: { id: taskId } })
    if (!existing) return reply.status(404).send({ error: "Tarea no encontrada" })

    const { data, becameDone } = buildTaskUpdate(existing, body.data)
    const task = await prisma.shipmentTask.update({ where: { id: taskId }, data })
    if (becameDone) {
      await logEvent(existing.shipmentId, existing.isMilestone ? "milestone" : "note", `✓ ${existing.name}`, request.session?.user.id ?? null, task.actualAt ?? undefined)
    }
    return reply.send(task)
  })

  app.patch("/leg-tasks/:taskId", { preHandler: requirePermission("shipments.advanceTask") }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = TaskUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.legTask.findUnique({ where: { id: taskId } })
    if (!existing) return reply.status(404).send({ error: "Tarea no encontrada" })

    const { data, becameDone } = buildTaskUpdate(existing, body.data)
    const task = await prisma.legTask.update({ where: { id: taskId }, data })
    if (becameDone) {
      await logEvent(existing.shipmentId, existing.isMilestone ? "milestone" : "note", `✓ ${existing.name}`, request.session?.user.id ?? null, task.actualAt ?? undefined)
    }
    return reply.send(task)
  })
}
