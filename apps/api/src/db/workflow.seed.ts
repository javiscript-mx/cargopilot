import { prisma } from "./client.js"

// ─── Plantillas de workflow (declarativas) ───────────────────────────────────
// Se siembran SOLO si no existen (no se sobreescriben → respeta ediciones del
// admin). Se instancian por copia-snapshot al expediente (ver lib/workflow.ts).

interface TaskSeed {
  code: string
  name: string
  kind?: string // panel especializado en la UI (generic | quote | …)
  isMilestone?: boolean
  optional?: boolean
  responsibleRole?: string
  responsibleSupplierType?: string
  requiredDocs?: string[]
  scope?: "any" | "local" | "foraneo" // solo para tareas de tramo
}
interface StageSeed {
  code: string
  name: string
  tasks: TaskSeed[]
}

// Plantilla de expediente: Flete terrestre
const FLETE_TERRESTRE: { code: string; name: string; operationType: string; description: string; stages: StageSeed[] } = {
  code: "flete_terrestre",
  name: "Flete terrestre",
  operationType: "DOMESTIC",
  description: "Flete terrestre local o foráneo. El transporte se desglosa en uno o más tramos.",
  stages: [
    {
      code: "instruccion",
      name: "Instrucción y cotización",
      tasks: [
        { code: "recibir_instruccion", name: "Recibir instrucción del cliente", responsibleRole: "operator" },
        { code: "cotizar", name: "Cotizar / confirmar tarifa", kind: "quote", responsibleRole: "operator", requiredDocs: ["cotizacion"] },
        { code: "confirmar_servicio", name: "Confirmar servicio con cliente", isMilestone: true, responsibleRole: "operator" },
      ],
    },
    {
      code: "transporte",
      name: "Transporte",
      tasks: [
        { code: "planear_tramos", name: "Planear tramos del servicio (local / foráneo)", responsibleRole: "operator" },
      ],
    },
    {
      code: "cierre",
      name: "Cierre y facturación",
      tasks: [
        { code: "facturar", name: "Facturar servicio al cliente", kind: "invoice", responsibleRole: "finance", requiredDocs: ["factura"] },
        { code: "conciliar", name: "Conciliar costos (flete, casetas)", responsibleRole: "finance" },
        { code: "cerrar", name: "Cerrar expediente", isMilestone: true, responsibleRole: "operator" },
      ],
    },
  ],
}

// Plantilla de tramo (sub-workflow de transporte). Las tareas con scope "foraneo"
// solo se instancian en tramos foráneos (las "any" siempre, "local" solo locales).
const TRAMO_TERRESTRE: { code: string; name: string; tasks: TaskSeed[] } = {
  code: "tramo_terrestre",
  name: "Tramo terrestre",
  tasks: [
    { code: "asignar_unidad", name: "Asignar transportista / unidad", responsibleRole: "operator", responsibleSupplierType: "carrier" },
    { code: "asignar_operador", name: "Asignar operador", responsibleRole: "operator", responsibleSupplierType: "carrier" },
    { code: "ubicaciones", name: "Capturar ubicaciones y validar mercancía SAT", scope: "foraneo", responsibleRole: "finance" },
    { code: "timbrar_cp", name: "Timbrar CFDI con complemento Carta Porte", scope: "foraneo", isMilestone: true, responsibleRole: "finance", requiredDocs: ["cfdi_carta_porte"] },
    { code: "recoleccion", name: "Recolección en origen + evidencia", isMilestone: true, responsibleSupplierType: "carrier", requiredDocs: ["evidencia_recoleccion"] },
    { code: "transito", name: "Registrar salida / tránsito", responsibleRole: "operator" },
    { code: "entrega", name: "Entrega en destino + POD", isMilestone: true, responsibleSupplierType: "carrier", requiredDocs: ["pod"] },
  ],
}

export async function seedWorkflowTemplates(): Promise<void> {
  // Plantilla de expediente
  const existing = await prisma.workflowTemplate.findUnique({ where: { code: FLETE_TERRESTRE.code } })
  if (!existing) {
    await prisma.workflowTemplate.create({
      data: {
        code: FLETE_TERRESTRE.code,
        name: FLETE_TERRESTRE.name,
        operationType: FLETE_TERRESTRE.operationType,
        description: FLETE_TERRESTRE.description,
        stages: {
          create: FLETE_TERRESTRE.stages.map((stage, si) => ({
            code: stage.code,
            name: stage.name,
            order: si + 1,
            tasks: {
              create: stage.tasks.map((t, ti) => ({
                code: t.code,
                name: t.name,
                order: ti + 1,
                kind: t.kind ?? "generic",
                isMilestone: t.isMilestone ?? false,
                optional: t.optional ?? false,
                responsibleRole: t.responsibleRole ?? null,
                responsibleSupplierType: t.responsibleSupplierType ?? null,
                requiredDocs: t.requiredDocs ?? [],
              })),
            },
          })),
        },
      },
    })
    console.log(`✓ Plantilla de workflow sembrada: ${FLETE_TERRESTRE.code}`)
  }

  // Plantilla de tramo
  const legExisting = await prisma.legTemplate.findUnique({ where: { code: TRAMO_TERRESTRE.code } })
  if (!legExisting) {
    await prisma.legTemplate.create({
      data: {
        code: TRAMO_TERRESTRE.code,
        name: TRAMO_TERRESTRE.name,
        tasks: {
          create: TRAMO_TERRESTRE.tasks.map((t, ti) => ({
            code: t.code,
            name: t.name,
            order: ti + 1,
            scope: t.scope ?? "any",
            kind: t.kind ?? "generic",
            isMilestone: t.isMilestone ?? false,
            optional: t.optional ?? false,
            responsibleRole: t.responsibleRole ?? null,
            responsibleSupplierType: t.responsibleSupplierType ?? null,
            requiredDocs: t.requiredDocs ?? [],
          })),
        },
      },
    })
    console.log(`✓ Plantilla de tramo sembrada: ${TRAMO_TERRESTRE.code}`)
  }
}
