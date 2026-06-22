import { prisma } from "../db/client.js"

// ─── Instanciación de workflow (copia-snapshot) ──────────────────────────────
// Copia la plantilla a la instancia del expediente. Editar la plantilla después
// NO muta lo ya instanciado (trazabilidad). Sin motor: el estado de cada paso lo
// mueve el usuario; aquí solo se materializa el checklist.

export async function instantiateWorkflow(shipmentId: string, templateCode: string) {
  const template = await prisma.workflowTemplate.findUnique({
    where: { code: templateCode },
    include: { stages: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { order: "asc" } } } } },
  })
  if (!template) throw new Error(`Plantilla de workflow no encontrada: ${templateCode}`)

  // Re-aplicar reemplaza el checklist del expediente (los tramos no se tocan aquí).
  await prisma.shipmentStage.deleteMany({ where: { shipmentId } })

  for (const stage of template.stages) {
    await prisma.shipmentStage.create({
      data: {
        shipmentId,
        stageTemplateId: stage.id,
        code: stage.code,
        name: stage.name,
        order: stage.order,
        tasks: {
          create: stage.tasks.map((t) => ({
            shipmentId,
            taskTemplateId: t.id,
            code: t.code,
            name: t.name,
            order: t.order,
            kind: t.kind,
            isMilestone: t.isMilestone,
            optional: t.optional,
            requiredDocs: t.requiredDocs,
          })),
        },
      },
    })
  }

  await prisma.shipment.update({ where: { id: shipmentId }, data: { workflowTemplateId: templateCode } })
}

// Agrega un tramo (sub-workflow) al expediente. Materializa solo las tareas de la
// plantilla cuyo scope aplica al tramo: "any" siempre, "foraneo"/"local" según corresponda.
export async function addLeg(
  shipmentId: string,
  opts: { scope: "local" | "foraneo"; legTemplateCode?: string },
) {
  const code = opts.legTemplateCode ?? "tramo_terrestre"
  const template = await prisma.legTemplate.findUnique({
    where: { code },
    include: { tasks: { orderBy: { order: "asc" } } },
  })

  // order = MÁXIMO + 1 (no count): tras borrar un tramo, count colisionaría con
  // un order existente. Mismo patrón que folios (ver lib/folio.ts).
  const existing = await prisma.shipmentLeg.findMany({ where: { shipmentId }, select: { order: true } })
  const nextOrder = existing.reduce((m, l) => Math.max(m, l.order), 0) + 1
  const tasks = (template?.tasks ?? []).filter((t) => t.scope === "any" || t.scope === opts.scope)

  return prisma.shipmentLeg.create({
    data: {
      shipmentId,
      legTemplateId: template?.id ?? null,
      order: nextOrder,
      scope: opts.scope,
      tasks: {
        create: tasks.map((t) => ({
          shipmentId,
          taskTemplateId: t.id,
          code: t.code,
          name: t.name,
          order: t.order,
          kind: t.kind,
          isMilestone: t.isMilestone,
          optional: t.optional,
          requiredDocs: t.requiredDocs,
        })),
      },
    },
    include: { tasks: { orderBy: { order: "asc" } } },
  })
}

// Reconcilia las tareas de un tramo cuando cambia su scope (local <-> foráneo):
// agrega las tareas de la plantilla que apliquen al nuevo scope y faltan, y borra
// las que dejan de aplicar SOLO si siguen pendientes (conserva el historial de las
// ya trabajadas). No toca las tareas "any".
export async function syncLegScopeTasks(legId: string, newScope: "local" | "foraneo") {
  const leg = await prisma.shipmentLeg.findUnique({
    where: { id: legId },
    select: { id: true, shipmentId: true, legTemplateId: true, tasks: { select: { id: true, code: true, status: true } } },
  })
  if (!leg) return

  const template = leg.legTemplateId
    ? await prisma.legTemplate.findUnique({ where: { id: leg.legTemplateId }, include: { tasks: { orderBy: { order: "asc" } } } })
    : await prisma.legTemplate.findUnique({ where: { code: "tramo_terrestre" }, include: { tasks: { orderBy: { order: "asc" } } } })

  const desired = (template?.tasks ?? []).filter((t) => t.scope === "any" || t.scope === newScope)
  const desiredCodes = new Set(desired.map((t) => t.code))
  const existingCodes = new Set(leg.tasks.map((t) => t.code))

  const toAdd = desired.filter((t) => !existingCodes.has(t.code))
  const toRemove = leg.tasks.filter((t) => !desiredCodes.has(t.code) && t.status === "pending")

  await prisma.$transaction([
    ...toRemove.map((t) => prisma.legTask.delete({ where: { id: t.id } })),
    ...toAdd.map((t) =>
      prisma.legTask.create({
        data: {
          legId: leg.id,
          shipmentId: leg.shipmentId,
          taskTemplateId: t.id,
          code: t.code,
          name: t.name,
          order: t.order,
          kind: t.kind,
          isMilestone: t.isMilestone,
          optional: t.optional,
          requiredDocs: t.requiredDocs,
        },
      }),
    ),
  ])
}

// ─── Auto-marcado de tareas del tramo (derivadas de datos, no del usuario) ────
// Estas tareas reflejan un HECHO verificable y se marcan/desmarcan solas según
// se llene la ruta, se asigne la unidad/operador y se timbre la Carta Porte.
// recoleccion/transito(salida)/entrega siguen siendo MANUALES (no hay señal).
export const AUTO_LEG_TASK_CODES = ["asignar_unidad", "asignar_operador", "ubicaciones", "timbrar_cp"] as const

export async function syncLegAutoTasks(legId: string): Promise<void> {
  const leg = await prisma.shipmentLeg.findUnique({
    where: { id: legId },
    select: {
      id: true, origin: true, destination: true,
      vehicles: { select: { vehicleId: true, operatorId: true, cartaPorteInvoiceId: true } },
      tasks: { select: { id: true, code: true, status: true } },
    },
  })
  if (!leg) return

  const loc = (v: unknown) => (v ?? {}) as { zip?: string; state?: string; rfc?: string }
  const o = loc(leg.origin), d = loc(leg.destination)
  const vs = leg.vehicles
  const hasUnits = vs.length > 0
  // Ruta lista = origen y destino con CP + Estado + RFC (remitente/destinatario)
  const routeOk = Boolean(o.zip && o.state && o.rfc && d.zip && d.state && d.rfc)

  const derived: Record<string, boolean> = {
    ubicaciones: routeOk,
    asignar_unidad: hasUnits && vs.every((v) => Boolean(v.vehicleId)),
    asignar_operador: hasUnits && vs.every((v) => Boolean(v.operatorId)),
    timbrar_cp: hasUnits && vs.every((v) => Boolean(v.cartaPorteInvoiceId)),
  }

  const updates = []
  for (const t of leg.tasks) {
    if (!(t.code in derived)) continue
    // No piso estados manuales especiales (omitida/bloqueada)
    if (t.status === "skipped" || t.status === "blocked") continue
    const target = derived[t.code] ? "done" : "pending"
    if (t.status !== target) {
      updates.push(prisma.legTask.update({
        where: { id: t.id },
        data: { status: target, completedAt: target === "done" ? new Date() : null },
      }))
    }
  }
  if (updates.length) await prisma.$transaction(updates)
}

// Tareas del EXPEDIENTE (no del tramo) que se derivan de datos verificables:
// cotizar (hay cargos en la cotización), planear_tramos (hay ≥1 tramo), facturar
// (factura de servicio timbrada). El resto (recibir instrucción, conciliar, cerrar…)
// son humanas y siguen manuales.
export const AUTO_SHIPMENT_TASK_CODES = ["recibir_instruccion", "cotizar", "planear_tramos", "facturar"] as const

export async function syncShipmentAutoTasks(shipmentId: string): Promise<void> {
  const [tasks, quote, legCount, invoices] = await Promise.all([
    prisma.shipmentTask.findMany({ where: { shipmentId }, select: { id: true, code: true, status: true } }),
    prisma.shipmentQuote.findUnique({ where: { shipmentId }, select: { items: true } }),
    prisma.shipmentLeg.count({ where: { shipmentId } }),
    // "invoice_cp" = factura de servicio con complemento Carta Porte; también cuenta como facturación
    prisma.invoice.findMany({ where: { shipmentId, kind: { in: ["service", "invoice_cp"] } }, select: { status: true } }),
  ])
  const quoteItems = (quote?.items as { amount?: number }[] | null) ?? []
  const quoteHasCharges = quoteItems.some((i) => Number(i.amount) > 0)
  const serviceStamped = invoices.some((i) => i.status === "stamped")

  const derived: Record<string, boolean> = {
    // Si ya hay cotización con cargos o un tramo planeado, la instrucción del cliente ya se recibió
    recibir_instruccion: quoteHasCharges || legCount > 0,
    cotizar: quoteHasCharges,
    planear_tramos: legCount > 0,
    facturar: serviceStamped,
  }

  const updates = []
  for (const t of tasks) {
    if (!(t.code in derived)) continue
    if (t.status === "skipped" || t.status === "blocked") continue
    const target = derived[t.code] ? "done" : "pending"
    if (t.status !== target) {
      updates.push(prisma.shipmentTask.update({
        where: { id: t.id },
        data: { status: target, completedAt: target === "done" ? new Date() : null },
      }))
    }
  }
  if (updates.length) await prisma.$transaction(updates)
}
