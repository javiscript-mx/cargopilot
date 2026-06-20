import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { instantiateWorkflow, addLeg, syncLegScopeTasks } from "../lib/workflow.js"
import { cartaPorteReadiness, buildCartaPorteComplemento, type CartaPorteContext } from "../lib/carta-porte.js"
import { createCFDI, getCFDIXml } from "../lib/facturama.js"
import { getShipmentReadiness } from "../lib/shipment-readiness.js"
import { withFolioRetry, folioNumber } from "../lib/folio.js"

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : fallback
}

// CANDADOS de cierre de tarea: una tarea con dato real no se cierra sin ese dato.
// Devuelve el motivo de bloqueo, o null si se puede marcar como hecha.
async function shipmentTaskBlocker(code: string, shipmentId: string): Promise<string | null> {
  if (code === "cotizar") {
    const quote = await prisma.shipmentQuote.findUnique({ where: { shipmentId } })
    const items = (quote?.items as { amount?: number }[] | null) ?? []
    if (!items.some((i) => Number(i.amount) > 0)) return "Captura la cotización (cargos al cliente) antes de cerrar este paso."
    if (quote?.status !== "accepted") return "Marca la cotización como aceptada por el cliente antes de cerrar este paso."
  }
  if (code === "confirmar_servicio") {
    const quote = await prisma.shipmentQuote.findUnique({ where: { shipmentId }, select: { status: true } })
    if (quote?.status !== "accepted") return "El cliente debe aceptar la cotización antes de confirmar el servicio."
  }
  if (code === "facturar") {
    const stamped = await prisma.invoice.count({ where: { shipmentId, kind: "service", status: "stamped" } })
    if (stamped === 0) return "Genera y timbra la factura del servicio antes de cerrar este paso."
  }
  if (code === "cerrar") {
    const readiness = await getShipmentReadiness(shipmentId)
    if (readiness && !readiness.gates.delivered.ok) return "No se puede cerrar: el expediente aún tiene datos pendientes (revisa el panel)."
  }
  return null
}

async function legTaskBlocker(code: string, legId: string): Promise<string | null> {
  const leg = await prisma.shipmentLeg.findUnique({ where: { id: legId }, include: { vehicles: true } })
  if (!leg) return null
  const zip = (v: unknown) => (v as { zip?: string } | null)?.zip
  if (code === "asignar_unidad" && (leg.vehicles.length === 0 || !leg.vehicles.every((v) => v.vehicleId)))
    return "Asigna transportista y unidad (con placas) al tramo antes de cerrar este paso."
  if (code === "asignar_operador" && (leg.vehicles.length === 0 || !leg.vehicles.every((v) => v.operatorId)))
    return "Asigna operador a cada unidad antes de cerrar este paso."
  if (code === "ubicaciones" && !(zip(leg.origin) && zip(leg.destination)))
    return "Captura el CP de origen y destino del tramo antes de cerrar este paso."
  if (code === "timbrar_cp" && (leg.vehicles.length === 0 || !leg.vehicles.every((v) => v.cartaPorteInvoiceId)))
    return "Timbra la Carta Porte de cada unidad del tramo antes de cerrar este paso."
  // recoleccion/entrega no se bloquean aquí: el handler guarda su fecha real en el tramo al marcarlas.
  return null
}

// Valida que la asignación de transporte sea coherente y autorizada:
// transportista activo, y vehículo/operador activos, AUTORIZADOS y que pertenezcan
// a ese transportista (evita cruces/basura por API aunque la UI filtre).
async function validateUnitAssignment(carrierSupplierId: string, vehicleId: string, operatorId: string): Promise<string | null> {
  const [carrier, vehicle, operator] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: carrierSupplierId }, select: { active: true } }),
    prisma.vehicle.findUnique({ where: { id: vehicleId }, select: { supplierId: true, active: true, status: true } }),
    prisma.operator.findUnique({ where: { id: operatorId }, select: { supplierId: true, active: true, status: true } }),
  ])
  if (!carrier || !carrier.active) return "El transportista no existe o está inactivo."
  if (!vehicle || !vehicle.active) return "El vehículo no existe o está inactivo."
  if (vehicle.status !== "authorized") return "El vehículo no está autorizado."
  if (vehicle.supplierId !== carrierSupplierId) return "El vehículo no pertenece al transportista seleccionado."
  if (!operator || !operator.active) return "El operador no existe o está inactivo."
  if (operator.status !== "authorized") return "El operador no está autorizado."
  if (operator.supplierId !== carrierSupplierId) return "El operador no pertenece al transportista seleccionado."
  return null
}

// Carga el contexto Carta Porte de una unidad (vehículo, operador, mercancía y su tramo)
async function loadCartaPorteContext(unitId: string): Promise<CartaPorteContext | null> {
  const unit = await prisma.legVehicle.findUnique({ where: { id: unitId } })
  if (!unit) return null
  const leg = await prisma.shipmentLeg.findUnique({ where: { id: unit.legId } })
  if (!leg) return null
  const [vehicle, operator, merchandise] = await Promise.all([
    unit.vehicleId ? prisma.vehicle.findUnique({ where: { id: unit.vehicleId } }) : Promise.resolve(null),
    unit.operatorId ? prisma.operator.findUnique({ where: { id: unit.operatorId } }) : Promise.resolve(null),
    prisma.merchandise.findMany({ where: { legVehicleId: unitId } }),
  ])
  return { leg, unit, vehicle, operator, merchandise }
}

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

// El tramo = segmento de ruta (sin transporte; éste vive en sus unidades)
const LegUpdateSchema = z.object({
  scope: z.enum(["local", "foraneo"]).optional(),
  status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
  origin: z.record(z.string(), z.unknown()).nullish(),
  destination: z.record(z.string(), z.unknown()).nullish(),
  distanceKm: z.number().nonnegative().nullish(),
  plannedPickupAt: z.string().datetime().nullish(),
  actualPickupAt: z.string().datetime().nullish(),
  plannedDeliveryAt: z.string().datetime().nullish(),
  actualDeliveryAt: z.string().datetime().nullish(),
  notes: z.string().nullish(),
})

// Unidad de transporte de un tramo (1 motriz + remolques + operador + CFDI CP)
const LegVehicleSchema = z.object({
  carrierSupplierId: z.string().nullish(),
  vehicleId: z.string().nullish(),
  operatorId: z.string().nullish(),
  trailer1Plate: z.string().nullish(),
  trailer1Type: z.string().nullish(),
  trailer2Plate: z.string().nullish(),
  trailer2Type: z.string().nullish(),
  cartaPorteInvoiceId: z.string().nullish(),
  notes: z.string().nullish(),
})

const toDate = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v === null ? null : new Date(v)

// Eventos del proceso = automáticos (source "system"): NO editables a mano y solo
// se registran los hitos (la bitácora es timeline, no eco del checklist).
async function logMilestone(shipmentId: string, title: string, userId: string | null, occurredAt?: Date) {
  await prisma.shipmentEvent.create({
    data: { shipmentId, type: "milestone", source: "system", title, occurredAt: occurredAt ?? new Date(), createdBy: userId },
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
        include: {
          tasks: { orderBy: { order: "asc" } },
          vehicles: { orderBy: { order: "asc" } },
        },
      }),
    ])

    // Resuelve nombres de transportista/unidad/operador (soft refs) de TODAS las
    // unidades de todos los tramos, en lote, para mostrarlos sin queries por fila.
    const allVehicles = legs.flatMap((l) => l.vehicles)
    const uniq = (vals: (string | null)[]) => [...new Set(vals.filter((v): v is string => Boolean(v)))]
    const [sups, vehs, ops] = await Promise.all([
      prisma.supplier.findMany({ where: { id: { in: uniq(allVehicles.map((v) => v.carrierSupplierId)) } }, select: { id: true, name: true } }),
      prisma.vehicle.findMany({ where: { id: { in: uniq(allVehicles.map((v) => v.vehicleId)) } }, select: { id: true, plates: true, economicNumber: true } }),
      prisma.operator.findMany({ where: { id: { in: uniq(allVehicles.map((v) => v.operatorId)) } }, select: { id: true, name: true } }),
    ])
    const supMap = new Map(sups.map((s) => [s.id, s.name]))
    const vehMap = new Map(vehs.map((v) => [v.id, v.economicNumber ? `${v.plates} · ${v.economicNumber}` : v.plates]))
    const opMap = new Map(ops.map((o) => [o.id, o.name]))
    const legsEnriched = legs.map((l) => ({
      ...l,
      vehicles: l.vehicles.map((v) => ({
        ...v,
        carrierName: v.carrierSupplierId ? supMap.get(v.carrierSupplierId) ?? null : null,
        vehicleLabel: v.vehicleId ? vehMap.get(v.vehicleId) ?? null : null,
        operatorName: v.operatorId ? opMap.get(v.operatorId) ?? null : null,
      })),
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
    return reply.status(201).send(leg)
  })

  app.patch("/legs/:legId", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { legId } = request.params as { legId: string }
    const body = LegUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data

    const existing = await prisma.shipmentLeg.findUnique({ where: { id: legId }, select: { id: true, scope: true } })
    if (!existing) return reply.status(404).send({ error: "Tramo no encontrado" })

    // Cambiar el scope reconcilia el checklist del tramo (agrega/quita tareas CP)
    if (d.scope !== undefined && d.scope !== existing.scope) {
      await syncLegScopeTasks(legId, d.scope)
    }

    const leg = await prisma.shipmentLeg.update({
      where: { id: legId },
      data: {
        ...(d.scope !== undefined ? { scope: d.scope } : {}),
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.origin !== undefined ? { origin: d.origin === null ? Prisma.JsonNull : (d.origin as Prisma.InputJsonValue) } : {}),
        ...(d.destination !== undefined ? { destination: d.destination === null ? Prisma.JsonNull : (d.destination as Prisma.InputJsonValue) } : {}),
        ...(d.distanceKm !== undefined ? { distanceKm: d.distanceKm } : {}),
        ...(d.plannedPickupAt !== undefined ? { plannedPickupAt: toDate(d.plannedPickupAt) } : {}),
        ...(d.actualPickupAt !== undefined ? { actualPickupAt: toDate(d.actualPickupAt) } : {}),
        ...(d.plannedDeliveryAt !== undefined ? { plannedDeliveryAt: toDate(d.plannedDeliveryAt) } : {}),
        ...(d.actualDeliveryAt !== undefined ? { actualDeliveryAt: toDate(d.actualDeliveryAt) } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      },
      include: { tasks: { orderBy: { order: "asc" } }, vehicles: { orderBy: { order: "asc" } } },
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

  // ── Unidades de transporte del tramo ─────────────────────────────────────────

  app.post("/legs/:legId/vehicles", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { legId } = request.params as { legId: string }
    const body = LegVehicleSchema.safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const leg = await prisma.shipmentLeg.findUnique({ where: { id: legId }, select: { id: true } })
    if (!leg) return reply.status(404).send({ error: "Tramo no encontrado" })

    const v = body.data
    // CANDADO: una unidad sin transportista/vehículo/operador es basura operativa.
    if (!v.carrierSupplierId || !v.vehicleId || !v.operatorId) {
      return reply.status(422).send({ error: "La unidad requiere transportista, vehículo y operador." })
    }
    const assignError = await validateUnitAssignment(v.carrierSupplierId, v.vehicleId, v.operatorId)
    if (assignError) return reply.status(422).send({ error: assignError })

    const count = await prisma.legVehicle.count({ where: { legId } })
    const vehicle = await prisma.legVehicle.create({
      data: {
        legId,
        order: count,
        carrierSupplierId: v.carrierSupplierId ?? null,
        vehicleId: v.vehicleId ?? null,
        operatorId: v.operatorId ?? null,
        trailer1Plate: v.trailer1Plate ?? null,
        trailer1Type: v.trailer1Type ?? null,
        trailer2Plate: v.trailer2Plate ?? null,
        trailer2Type: v.trailer2Type ?? null,
        cartaPorteInvoiceId: v.cartaPorteInvoiceId ?? null,
        notes: v.notes ?? null,
      },
    })
    return reply.status(201).send(vehicle)
  })

  app.patch("/leg-vehicles/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = LegVehicleSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const v = body.data

    const existing = await prisma.legVehicle.findUnique({ where: { id } })
    if (!existing) return reply.status(404).send({ error: "Unidad no encontrada" })

    // CANDADO: el resultado del update no puede quedar sin transportista/vehículo/operador
    const eff = (key: "carrierSupplierId" | "vehicleId" | "operatorId") =>
      v[key] !== undefined ? v[key] : existing[key]
    const carrierId = eff("carrierSupplierId"), vehId = eff("vehicleId"), opId = eff("operatorId")
    if (!carrierId || !vehId || !opId) {
      return reply.status(422).send({ error: "La unidad requiere transportista, vehículo y operador." })
    }
    const assignError = await validateUnitAssignment(carrierId, vehId, opId)
    if (assignError) return reply.status(422).send({ error: assignError })

    const vehicle = await prisma.legVehicle.update({
      where: { id },
      data: {
        ...(v.carrierSupplierId !== undefined ? { carrierSupplierId: v.carrierSupplierId } : {}),
        ...(v.vehicleId !== undefined ? { vehicleId: v.vehicleId } : {}),
        ...(v.operatorId !== undefined ? { operatorId: v.operatorId } : {}),
        ...(v.trailer1Plate !== undefined ? { trailer1Plate: v.trailer1Plate } : {}),
        ...(v.trailer1Type !== undefined ? { trailer1Type: v.trailer1Type } : {}),
        ...(v.trailer2Plate !== undefined ? { trailer2Plate: v.trailer2Plate } : {}),
        ...(v.trailer2Type !== undefined ? { trailer2Type: v.trailer2Type } : {}),
        ...(v.cartaPorteInvoiceId !== undefined ? { cartaPorteInvoiceId: v.cartaPorteInvoiceId } : {}),
        ...(v.notes !== undefined ? { notes: v.notes } : {}),
      },
    })
    return reply.send(vehicle)
  })

  app.delete("/leg-vehicles/:id", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await prisma.legVehicle.findUnique({ where: { id }, select: { id: true } })
    if (!existing) return reply.status(404).send({ error: "Unidad no encontrada" })
    await prisma.legVehicle.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── Carta Porte por unidad (1 unidad = 1 CFDI con complemento) ───────────────

  // Completitud: qué falta para poder timbrar la Carta Porte de esta unidad
  app.get("/leg-vehicles/:id/carta-porte", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const ctx = await loadCartaPorteContext(id)
    if (!ctx) return reply.status(404).send({ error: "Unidad no encontrada" })

    const readiness = cartaPorteReadiness(ctx)
    const defaultTipo = await getSetting("invoicing.cartaPorteTipo", "ingreso")
    const invoice = ctx.unit.cartaPorteInvoiceId
      ? await prisma.invoice.findUnique({ where: { id: ctx.unit.cartaPorteInvoiceId }, select: { id: true, series: true, folio: true, status: true, total: true } })
      : null
    return reply.send({ ...readiness, defaultTipo, invoice })
  })

  // Timbrar la Carta Porte de la unidad (Ingreso+CP por defecto; Traslado+CP opción)
  app.post("/leg-vehicles/:id/carta-porte/stamp", { preHandler: requirePermission("invoices.stamp") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      tipo: z.enum(["ingreso", "traslado"]).optional(),
      freightAmount: z.number().positive().optional(), // requerido para ingreso
      freightConcept: z.string().optional(),
    }).safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const ctx = await loadCartaPorteContext(id)
    if (!ctx) return reply.status(404).send({ error: "Unidad no encontrada" })
    if (ctx.unit.cartaPorteInvoiceId) return reply.status(409).send({ error: "Esta unidad ya tiene Carta Porte timbrada" })

    // Atrapa los errores ANTES del SAT
    const readiness = cartaPorteReadiness(ctx)
    if (!readiness.ready) {
      const missing = readiness.groups.flatMap((g) => g.items.filter((i) => !i.ok).map((i) => `${g.group}: ${i.label}`))
      return reply.status(422).send({ error: "Faltan datos para la Carta Porte", missing })
    }

    const tipo = body.data.tipo ?? (await getSetting("invoicing.cartaPorteTipo", "ingreso"))
    const isIngreso = tipo === "ingreso"

    const shipment = await prisma.shipment.findUnique({ where: { id: ctx.leg.shipmentId }, include: { customer: true } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    const customer = shipment.customer

    const expeditionPlace = await getSetting("invoicing.emisorCp", process.env["EMISOR_CP"] ?? "")
    if (!expeditionPlace) return reply.status(422).send({ error: "Falta el CP del emisor (Configuración → Facturación)." })

    if (isIngreso) {
      if (!customer.fiscalRegime || !customer.fiscalZipCode) {
        return reply.status(422).send({ error: "El cliente no tiene régimen fiscal y/o CP fiscal. Complétalos para timbrar." })
      }
      if (!body.data.freightAmount) return reply.status(422).send({ error: "Indica el monto del flete para el CFDI de Ingreso." })
    }

    const facturamaSerie = await getSetting("invoicing.facturamaSerie", "")
    const complemento = buildCartaPorteComplemento(ctx)

    // Items: Ingreso = flete con IVA; Traslado = valor 0 sin impuestos (S01)
    const amount = body.data.freightAmount ?? 0
    const subtotal = round2(amount)
    const tax = isIngreso ? round2(subtotal * 0.16) : 0
    const total = round2(subtotal + tax)
    const item = {
      Quantity: 1,
      ProductCode: "78101800",
      UnitCode: "E48",
      Unit: "Servicio",
      Description: body.data.freightConcept ?? "Servicio de transporte de carga",
      UnitPrice: subtotal,
      Subtotal: subtotal,
      TaxObject: isIngreso ? "02" : "01",
      Taxes: isIngreso ? [{ Total: tax, Name: "IVA", Base: subtotal, Rate: 0.16, IsRetention: false }] : [],
      Total: total,
    }

    const isForeign = (customer.taxCountry ?? "MX") !== "MX"
    const payload = {
      ...(facturamaSerie ? { Serie: facturamaSerie } : {}),
      Currency: "MXN",
      ExpeditionPlace: expeditionPlace,
      PaymentForm: customer.defaultPaymentForm ?? "03",
      PaymentMethod: customer.defaultPaymentMethod ?? "PUE",
      CfdiType: (isIngreso ? "I" : "T") as "I" | "T",
      Receiver: {
        Rfc: isIngreso ? customer.rfc : "XAXX010101000",
        Name: isIngreso ? (customer.legalName ?? customer.name) : (customer.legalName ?? customer.name),
        CfdiUse: isIngreso ? (customer.defaultCfdiUse ?? "G03") : "S01",
        FiscalRegime: customer.fiscalRegime ?? "616",
        TaxZipCode: customer.fiscalZipCode ?? expeditionPlace,
        ...(isForeign && customer.taxCountry ? { TaxResidence: customer.taxCountry } : {}),
        ...(isForeign && customer.foreignTaxId ? { NumRegIdTrib: customer.foreignTaxId } : {}),
      },
      Items: [item],
      Complemento: complemento,
    }

    let result: { Id: string }
    try {
      result = await createCFDI(payload)
    } catch (err) {
      request.log.error(err, "Error timbrando Carta Porte con Facturama")
      return reply.status(502).send({ error: err instanceof Error ? err.message : "Error al timbrar" })
    }

    // Persiste el CFDI como Invoice y enlázalo a la unidad
    const series = facturamaSerie || "CP"
    const nextFolio = async () => {
      const rows = await prisma.invoice.findMany({ where: { series }, select: { folio: true } })
      const max = rows.reduce((m, r) => Math.max(m, folioNumber(r.folio)), 0)
      return String(max + 1).padStart(5, "0")
    }
    const invoice = await withFolioRetry(async () =>
      prisma.invoice.create({
        data: {
          series, folio: await nextFolio(),
          kind: "carta_porte",
          status: "stamped", facturamaid: result.Id, stampedAt: new Date(),
          customerId: customer.id, shipmentId: shipment.id,
          cfdiUse: isIngreso ? (customer.defaultCfdiUse ?? "G03") : "S01",
          paymentForm: customer.defaultPaymentForm ?? "03",
          paymentMethod: customer.defaultPaymentMethod ?? "PUE",
          items: [item] as unknown as Prisma.InputJsonValue,
          subtotal, tax, total,
        },
      }),
    )
    await prisma.legVehicle.update({ where: { id }, data: { cartaPorteInvoiceId: invoice.id } })

    try {
      const xml = await getCFDIXml(result.Id)
      await prisma.invoice.update({ where: { id: invoice.id }, data: { xmlContent: Buffer.from(xml, "base64").toString("utf-8") } })
    } catch (err) {
      request.log.warn(err, "No se pudo cachear XML de Carta Porte; on-demand")
    }

    return reply.send({ ok: true, invoiceId: invoice.id, facturamaId: result.Id })
  })

  // ── Cotización / tarifa del expediente (paso kind=quote) ─────────────────────

  const QuoteSchema = z.object({
    status: z.enum(["draft", "sent", "accepted", "rejected"]).optional(),
    currency: z.string().optional(),
    validUntil: z.string().datetime().nullish(),
    items: z.array(z.object({ concept: z.string(), amount: z.number(), productKey: z.string().optional() })).optional(),
    estimatedCost: z.number().nonnegative().nullish(),
    notes: z.string().nullish(),
  })

  app.get("/shipments/:id/quote", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const quote = await prisma.shipmentQuote.findUnique({ where: { shipmentId: id } })
    return reply.send(quote) // null si aún no hay cotización
  })

  app.put("/shipments/:id/quote", { preHandler: requirePermission("shipments.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = QuoteSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })

    const d = body.data
    const data = {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.currency !== undefined ? { currency: d.currency } : {}),
      ...(d.validUntil !== undefined ? { validUntil: toDate(d.validUntil) } : {}),
      ...(d.items !== undefined ? { items: d.items as Prisma.InputJsonValue } : {}),
      ...(d.estimatedCost !== undefined ? { estimatedCost: d.estimatedCost } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    }
    const quote = await prisma.shipmentQuote.upsert({
      where: { shipmentId: id },
      create: { shipmentId: id, ...data },
      update: data,
    })
    return reply.send(quote)
  })

  // ── Tareas (de fase y de tramo) ─────────────────────────────────────────────

  app.patch("/shipment-tasks/:taskId", { preHandler: requirePermission("shipments.advanceTask") }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = TaskUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.shipmentTask.findUnique({ where: { id: taskId } })
    if (!existing) return reply.status(404).send({ error: "Tarea no encontrada" })

    if (body.data.status === "done" && existing.status !== "done") {
      const blocker = await shipmentTaskBlocker(existing.code, existing.shipmentId)
      if (blocker) return reply.status(422).send({ error: blocker })
    }

    const { data, becameDone } = buildTaskUpdate(existing, body.data)
    const task = await prisma.shipmentTask.update({ where: { id: taskId }, data })
    if (becameDone && existing.isMilestone) {
      await logMilestone(existing.shipmentId, existing.name, request.session?.user.id ?? null, task.actualAt ?? undefined)
    }
    return reply.send(task)
  })

  app.patch("/leg-tasks/:taskId", { preHandler: requirePermission("shipments.advanceTask") }, async (request, reply) => {
    const { taskId } = request.params as { taskId: string }
    const body = TaskUpdateSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const existing = await prisma.legTask.findUnique({ where: { id: taskId } })
    if (!existing) return reply.status(404).send({ error: "Tarea no encontrada" })

    if (body.data.status === "done" && existing.status !== "done") {
      // Recolección/entrega: la fecha real es del TRAMO (fuente única, alimenta Carta Porte
      // y los candados). Si el usuario la capturó en la tarea, se propaga al tramo; si no, ahora.
      if (existing.code === "recoleccion" || existing.code === "entrega") {
        const when = body.data.actualAt !== undefined ? toDate(body.data.actualAt)! : new Date()
        const field = existing.code === "recoleccion" ? "actualPickupAt" : "actualDeliveryAt"
        await prisma.shipmentLeg.update({ where: { id: existing.legId }, data: { [field]: when } })
      } else {
        const blocker = await legTaskBlocker(existing.code, existing.legId)
        if (blocker) return reply.status(422).send({ error: blocker })
      }
    }

    const { data, becameDone } = buildTaskUpdate(existing, body.data)
    const task = await prisma.legTask.update({ where: { id: taskId }, data })
    if (becameDone && existing.isMilestone) {
      await logMilestone(existing.shipmentId, existing.name, request.session?.user.id ?? null, task.actualAt ?? undefined)
    }
    return reply.send(task)
  })
}
