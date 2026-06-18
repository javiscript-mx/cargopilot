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

  const count = await prisma.shipmentLeg.count({ where: { shipmentId } })
  const tasks = (template?.tasks ?? []).filter((t) => t.scope === "any" || t.scope === opts.scope)

  return prisma.shipmentLeg.create({
    data: {
      shipmentId,
      legTemplateId: template?.id ?? null,
      order: count + 1,
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
