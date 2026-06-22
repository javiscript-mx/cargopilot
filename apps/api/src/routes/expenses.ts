import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

// OJO: `status` NO se acepta aquí a propósito. El estado del gasto se DERIVA del flujo
// de autorización y pagos (endpoints authorize/payments/revert, que exigen
// purchases.authorize). Permitir setearlo en alta/edición (solo purchases.write) dejaría
// marcar "pagado/autorizado" saltándose el control y la evidencia.
const ExpenseSchema = z.object({
  category: z.string().min(1),
  concept: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().default("MXN"),
  supplierId: z.string().nullish(),
  expenseDate: z.string().datetime().nullish(),
  reference: z.string().nullish(),
  notes: z.string().nullish(),
})

const PaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(["transferencia", "cheque", "efectivo", "tarjeta", "otro"]).default("transferencia"),
  reference: z.string().nullish(),
  paidAt: z.string().datetime().nullish(),
  notes: z.string().nullish(),
})

type ExpenseStatus = "pending" | "authorized" | "partial" | "paid"
function deriveStatus(amount: number, authorizedAt: Date | null, paid: number): ExpenseStatus {
  if (amount > 0 && paid >= amount - 0.005) return "paid"
  if (paid > 0.005) return "partial"
  if (authorizedAt) return "authorized"
  return "pending"
}
// Recalcula y persiste el status (denormalizado para poder filtrar en BD) desde los pagos
async function recomputeStatus(expenseId: string) {
  const e = await prisma.shipmentExpense.findUnique({ where: { id: expenseId }, include: { payments: true } })
  if (!e) return null
  const paid = e.payments.reduce((a, p) => a + Number(p.amount), 0)
  const status = deriveStatus(Number(e.amount), e.authorizedAt, paid)
  const lastPaid = e.payments.length ? new Date(Math.max(...e.payments.map((p) => +new Date(p.paidAt)))) : null
  return prisma.shipmentExpense.update({ where: { id: expenseId }, data: { status, paidAt: status === "paid" ? lastPaid : null } })
}

export async function expensesRoutes(app: FastifyInstance) {
  // Compras / cuentas por pagar — vista global (módulo Finanzas) y por proveedor
  app.get("/expenses", { preHandler: requirePermission("purchases.read") }, async (request, reply) => {
    const { supplierId, status, category, from, to } = request.query as { supplierId?: string; status?: string; category?: string; from?: string; to?: string }
    // Rango de fechas: por fecha del gasto (expenseDate); si no tiene, cae a la de registro (createdAt)
    const range = (v?: string, end = false) => (v ? new Date(end ? `${v}T23:59:59.999Z` : `${v}T00:00:00.000Z`) : undefined)
    const gte = range(from), lte = range(to, true)
    const dateWhere = gte || lte
      ? { OR: [
          { expenseDate: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } },
          { expenseDate: null, createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } },
        ] }
      : {}
    const expenses = await prisma.shipmentExpense.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...dateWhere,
      },
      include: { shipment: { select: { id: true, folio: true } }, payments: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    })
    // supplier es soft-ref (sin relación FK): resolvemos nombre + días de crédito aparte
    const supplierIds = [...new Set(expenses.map((e) => e.supplierId).filter(Boolean) as string[])]
    const suppliers = supplierIds.length
      ? await prisma.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, creditTermsDays: true } })
      : []
    const supplierById = new Map(suppliers.map((s) => [s.id, s]))
    // hasEvidence para mostrar el faltante de comprobante también en Finanzas
    const docs = expenses.length
      ? await prisma.document.groupBy({ by: ["entityId"], where: { entityType: "expense", entityId: { in: expenses.map((e) => e.id) } }, _count: true })
      : []
    const docCount = new Map(docs.map((d) => [d.entityId, d._count]))
    return reply.send(expenses.map((e) => {
      const sup = e.supplierId ? supplierById.get(e.supplierId) : undefined
      // Vencimiento = (fecha del gasto o registro) + días de crédito del proveedor
      const creditDays = sup?.creditTermsDays ?? null
      const base = e.expenseDate ?? e.createdAt
      const dueDate = creditDays != null ? new Date(base.getTime() + creditDays * 86400000) : null
      const paidAmount = e.payments.reduce((a, p) => a + Number(p.amount), 0)
      return {
        ...e,
        supplierName: sup?.name ?? null,
        creditTermsDays: creditDays,
        dueDate: dueDate?.toISOString() ?? null,
        paidAmount: paidAmount.toFixed(2),
        hasEvidence: Boolean(e.reference) || (docCount.get(e.id) ?? 0) > 0,
      }
    }))
  })

  // Crear un gasto desde Compras: ligado a un expediente o GENERAL (sin expediente)
  app.post("/expenses", { preHandler: requirePermission("purchases.write") }, async (request, reply) => {
    const body = ExpenseSchema.extend({ shipmentId: z.string().cuid().nullish() }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    if (d.shipmentId) {
      const s = await prisma.shipment.findUnique({ where: { id: d.shipmentId }, select: { id: true } })
      if (!s) return reply.status(404).send({ error: "Expediente no encontrado" })
    }
    const expense = await prisma.shipmentExpense.create({
      data: {
        shipmentId: d.shipmentId ?? null,
        category: d.category, concept: d.concept, amount: d.amount, currency: d.currency,
        supplierId: d.supplierId ?? null,
        expenseDate: d.expenseDate ? new Date(d.expenseDate) : null,
        reference: d.reference ?? null, notes: d.notes ?? null,
        createdBy: request.session?.user.id ?? null,
      },
    })
    return reply.status(201).send(expense)
  })

  // Detalle de un gasto: datos + pagos + proveedor + resumen del expediente (si está ligado)
  app.get("/expenses/:id", { preHandler: requirePermission("purchases.read") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const e = await prisma.shipmentExpense.findUnique({
      where: { id },
      include: {
        payments: { orderBy: { paidAt: "desc" } },
        shipment: { select: { id: true, folio: true, status: true, origin: true, destination: true, cargoType: true, customer: { select: { name: true } } } },
      },
    })
    if (!e) return reply.status(404).send({ error: "Gasto no encontrado" })
    const supplier = e.supplierId ? await prisma.supplier.findUnique({ where: { id: e.supplierId }, select: { id: true, name: true, creditTermsDays: true } }) : null
    const docCount = await prisma.document.count({ where: { entityType: "expense", entityId: id } })
    const creditDays = supplier?.creditTermsDays ?? null
    const base = e.expenseDate ?? e.createdAt
    const dueDate = creditDays != null ? new Date(base.getTime() + creditDays * 86400000) : null
    const paidAmount = e.payments.reduce((a, p) => a + Number(p.amount), 0)
    return reply.send({
      ...e,
      supplierName: supplier?.name ?? null,
      creditTermsDays: creditDays,
      dueDate: dueDate?.toISOString() ?? null,
      paidAmount: paidAmount.toFixed(2),
      hasEvidence: Boolean(e.reference) || docCount > 0,
    })
  })

  app.get("/shipments/:id/expenses", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const expenses = await prisma.shipmentExpense.findMany({ where: { shipmentId: id }, orderBy: { createdAt: "desc" }, include: { payments: true } })
    // Evidencia = folio de factura (reference) O un documento adjunto al gasto
    const docs = expenses.length
      ? await prisma.document.groupBy({ by: ["entityId"], where: { entityType: "expense", entityId: { in: expenses.map((e) => e.id) } }, _count: true })
      : []
    const docCount = new Map(docs.map((d) => [d.entityId, d._count]))
    return reply.send(expenses.map((e) => ({
      ...e,
      paidAmount: e.payments.reduce((a, p) => a + Number(p.amount), 0).toFixed(2),
      hasEvidence: Boolean(e.reference) || (docCount.get(e.id) ?? 0) > 0,
    })))
  })

  app.post("/shipments/:id/expenses", { preHandler: requirePermission("purchases.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ExpenseSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const shipment = await prisma.shipment.findUnique({ where: { id }, select: { id: true } })
    if (!shipment) return reply.status(404).send({ error: "Expediente no encontrado" })
    const d = body.data
    const expense = await prisma.shipmentExpense.create({
      data: {
        shipmentId: id,
        category: d.category,
        concept: d.concept,
        amount: d.amount,
        currency: d.currency,
        supplierId: d.supplierId ?? null,
        expenseDate: d.expenseDate ? new Date(d.expenseDate) : null,
        reference: d.reference ?? null,
        notes: d.notes ?? null,
        createdBy: request.session?.user.id ?? null,
      },
    })
    return reply.status(201).send(expense)
  })

  app.put("/expenses/:expenseId", { preHandler: requirePermission("purchases.write") }, async (request, reply) => {
    const { expenseId } = request.params as { expenseId: string }
    const body = ExpenseSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const d = body.data
    await prisma.shipmentExpense.update({
      where: { id: expenseId },
      data: {
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.concept !== undefined ? { concept: d.concept } : {}),
        ...(d.amount !== undefined ? { amount: d.amount } : {}),
        ...(d.currency !== undefined ? { currency: d.currency } : {}),
        ...(d.supplierId !== undefined ? { supplierId: d.supplierId ?? null } : {}),
        ...(d.expenseDate !== undefined ? { expenseDate: d.expenseDate ? new Date(d.expenseDate) : null } : {}),
        ...(d.reference !== undefined ? { reference: d.reference ?? null } : {}),
        ...(d.notes !== undefined ? { notes: d.notes ?? null } : {}),
      },
    })
    // El status se deriva (autorización + pagos): si cambió el monto, recalcula para no
    // desincronizar (p. ej. bajar el monto puede saldar el gasto y pasarlo a "paid").
    const expense = await recomputeStatus(expenseId)
    return reply.send(expense)
  })

  app.delete("/expenses/:expenseId", { preHandler: requirePermission("purchases.write") }, async (request, reply) => {
    const { expenseId } = request.params as { expenseId: string }
    await prisma.shipmentExpense.delete({ where: { id: expenseId } })
    return reply.status(204).send()
  })

  // ── Flujo de autorización (módulo Finanzas / Compras): pending → authorized → paid ──
  // Autorizar exige comprobante (folio o documento), igual que el candado de cierre.
  app.post("/expenses/:expenseId/authorize", { preHandler: requirePermission("purchases.authorize") }, async (request, reply) => {
    const { expenseId } = request.params as { expenseId: string }
    const expense = await prisma.shipmentExpense.findUnique({ where: { id: expenseId } })
    if (!expense) return reply.status(404).send({ error: "Gasto no encontrado" })
    const docCount = await prisma.document.count({ where: { entityType: "expense", entityId: expenseId } })
    if (!expense.reference && docCount === 0) {
      return reply.status(422).send({ error: "No se puede autorizar sin comprobante: captura el folio de la factura o adjunta el documento." })
    }
    const updated = await prisma.shipmentExpense.update({
      where: { id: expenseId },
      data: { status: "authorized", authorizedBy: request.session?.user.id ?? null, authorizedAt: new Date() },
    })
    return reply.send(updated)
  })

  // Registrar un pago (total o PARCIAL). Requiere gasto autorizado y no sobrepasar el monto.
  app.post("/expenses/:expenseId/payments", { preHandler: requirePermission("purchases.authorize") }, async (request, reply) => {
    const { expenseId } = request.params as { expenseId: string }
    const body = PaymentSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const expense = await prisma.shipmentExpense.findUnique({ where: { id: expenseId }, include: { payments: true } })
    if (!expense) return reply.status(404).send({ error: "Gasto no encontrado" })
    if (!expense.authorizedAt) return reply.status(422).send({ error: "Autoriza el gasto antes de registrar un pago." })
    const paid = expense.payments.reduce((a, p) => a + Number(p.amount), 0)
    const remaining = Number(expense.amount) - paid
    if (body.data.amount > remaining + 0.005) {
      return reply.status(422).send({ error: `El pago excede el saldo pendiente (${remaining.toFixed(2)} ${expense.currency}).` })
    }
    await prisma.expensePayment.create({
      data: {
        expenseId,
        amount: body.data.amount,
        method: body.data.method,
        reference: body.data.reference ?? null,
        paidAt: body.data.paidAt ? new Date(body.data.paidAt) : new Date(),
        notes: body.data.notes ?? null,
        createdBy: request.session?.user.id ?? null,
      },
    })
    return reply.send(await recomputeStatus(expenseId))
  })

  app.delete("/expenses/:expenseId/payments/:paymentId", { preHandler: requirePermission("purchases.authorize") }, async (request, reply) => {
    const { expenseId, paymentId } = request.params as { expenseId: string; paymentId: string }
    await prisma.expensePayment.delete({ where: { id: paymentId } })
    return reply.send(await recomputeStatus(expenseId))
  })

  // Revertir: deshace autorización y borra los pagos → vuelve a "pendiente"
  app.post("/expenses/:expenseId/revert", { preHandler: requirePermission("purchases.authorize") }, async (request, reply) => {
    const { expenseId } = request.params as { expenseId: string }
    await prisma.expensePayment.deleteMany({ where: { expenseId } })
    const updated = await prisma.shipmentExpense.update({
      where: { id: expenseId },
      data: { status: "pending", authorizedBy: null, authorizedAt: null, paidAt: null },
    })
    return reply.send(updated)
  })
}
