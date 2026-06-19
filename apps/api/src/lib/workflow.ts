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
          isMilestone: t.isMilestone,
          optional: t.optional,
          requiredDocs: t.requiredDocs,
        },
      }),
    ),
  ])
}
