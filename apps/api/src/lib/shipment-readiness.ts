// Motor de completitud del expediente (flete terrestre): única fuente de verdad de
// "qué está listo / qué falta". Lo consumen los CANDADOS de backend (transición de
// estado, cierre de tareas) y el PANEL "Expediente listo / bloqueado" de la UI.
// Filosofía: capturar progresivo, pero NO avanzar la operación con datos faltantes.

import { prisma } from "../db/client.js"

export interface ReadinessCheck { label: string; ok: boolean }
export interface ReadinessBlock { key: string; title: string; checks: ReadinessCheck[]; ok: boolean; applies: boolean }
export type TargetStatus = "confirmed" | "in_transit" | "delivered"

export interface ShipmentReadiness {
  blocks: ReadinessBlock[]
  hasForaneo: boolean
  // Por estado destino: si se puede y, si no, qué falta
  gates: Record<TargetStatus, { ok: boolean; missing: string[] }>
  nextAction: { label: string; hint: string } | null
  // Hay operación en curso → cliente y tipo de operación quedan bloqueados
  locked: boolean
}

interface LocLike { zip?: string; rfc?: string }
const zip = (v: unknown): string | undefined => (v as LocLike | null)?.zip
const rfc = (v: unknown): string | undefined => (v as LocLike | null)?.rfc

export async function getShipmentReadiness(shipmentId: string): Promise<ShipmentReadiness | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { customer: { include: { contacts: true } } },
  })
  if (!shipment) return null

  const [legs, merchandise, quote, invoices, entregaTasks, doneTaskCount, docCount, expenses] = await Promise.all([
    prisma.shipmentLeg.findMany({ where: { shipmentId }, orderBy: { order: "asc" }, include: { vehicles: true } }),
    prisma.merchandise.findMany({ where: { shipmentId } }),
    prisma.shipmentQuote.findUnique({ where: { shipmentId } }),
    prisma.invoice.findMany({ where: { shipmentId } }),
    prisma.legTask.findMany({ where: { shipmentId, code: "entrega" }, select: { status: true } }),
    prisma.legTask.count({ where: { shipmentId, status: "done" } }),
    prisma.document.count({ where: { entityType: "shipment", entityId: shipmentId } }),
    prisma.shipmentExpense.findMany({ where: { shipmentId }, select: { id: true, reference: true } }),
  ])
  // Evidencia de gastos: folio de factura (reference) o documento adjunto al gasto
  const expenseDocs = expenses.length
    ? await prisma.document.groupBy({ by: ["entityId"], where: { entityType: "expense", entityId: { in: expenses.map((e) => e.id) } }, _count: true })
    : []
  const expenseDocCount = new Map(expenseDocs.map((d) => [d.entityId, d._count]))
  const expensesAllHaveEvidence = expenses.every((e) => Boolean(e.reference) || (expenseDocCount.get(e.id) ?? 0) > 0)
  // Bloqueo de cliente/tipo: por PROGRESO REAL (no por el workflow auto-aplicado ni el
  // evento "Expediente creado"). Un borrador recién creado aún se puede corregir.
  const locked = shipment.status !== "draft" || legs.length > 0 || invoices.length > 0 || doneTaskCount > 0
  // Factura de servicio al cliente = "service" o "invoice_cp" (servicio + complemento Carta Porte);
  // la CFDI de CP por unidad ("carta_porte") NO cuenta como facturación del servicio.
  const isServiceInvoice = (k: string) => k === "service" || k === "invoice_cp"
  const stampedServiceInvoice = invoices.some((i) => isServiceInvoice(i.kind) && i.status === "stamped")
  const hasServiceInvoice = invoices.some((i) => isServiceInvoice(i.kind))

  const c = shipment.customer
  const foraneoLegs = legs.filter((l) => l.scope === "foraneo")
  const hasForaneo = foraneoLegs.length > 0
  const quoteItems = (quote?.items as { amount?: number }[] | null) ?? []
  const quoteHasCharges = quoteItems.some((i) => Number(i.amount) > 0)

  // ── Bloques operativos/fiscales/documentales ──
  const blocks: ReadinessBlock[] = []
  const push = (key: string, title: string, checks: ReadinessCheck[], applies = true) =>
    blocks.push({ key, title, checks, applies, ok: !applies || checks.every((x) => x.ok) })

  push("cliente", "Cliente", [
    { label: "Cliente activo (no bloqueado/suspendido)", ok: !["blocked", "suspended", "inactive"].includes(c.status) },
    { label: "Datos fiscales (régimen + CP fiscal)", ok: Boolean(c.fiscalRegime && c.fiscalZipCode) },
    { label: "Razón social fiscal", ok: Boolean(c.legalName) },
    { label: "Al menos un contacto", ok: c.contacts.length > 0 },
  ])

  push("ruta", "Ruta y tramos", [
    { label: "Al menos un tramo", ok: legs.length > 0 },
    { label: "Origen y destino en cada tramo", ok: legs.length > 0 && legs.every((l) => Boolean(zip(l.origin) && zip(l.destination))) },
    // Carta Porte exige RFC de remitente y destinatario en los tramos foráneos
    { label: "RFC de remitente y destinatario (tramos foráneos)", ok: !hasForaneo || foraneoLegs.every((l) => Boolean(rfc(l.origin) && rfc(l.destination))) },
  ])

  push("mercancia", "Mercancía", [
    { label: "Al menos una mercancía", ok: merchandise.length > 0 },
  ])

  push("transporte", "Transporte", [
    { label: "Cada tramo con al menos una unidad", ok: legs.length > 0 && legs.every((l) => l.vehicles.length > 0) },
    { label: "Cada unidad con vehículo y operador", ok: legs.length > 0 && legs.every((l) => l.vehicles.every((v) => Boolean(v.vehicleId && v.operatorId))) },
  ])

  push("cotizacion", "Cotización", [
    { label: "Cotización con cargos", ok: quoteHasCharges },
    { label: "Aceptada por el cliente", ok: quote?.status === "accepted" },
  ])

  // Carta Porte: solo aplica si hay tramos foráneos
  push("carta_porte", "Carta Porte", [
    { label: "Carta Porte timbrada en cada unidad foránea", ok: hasForaneo && foraneoLegs.every((l) => l.vehicles.length > 0 && l.vehicles.every((v) => Boolean(v.cartaPorteInvoiceId))) },
  ], hasForaneo)

  push("facturacion", "Facturación", [
    { label: "Factura del servicio generada", ok: hasServiceInvoice },
    { label: "Factura del servicio timbrada", ok: stampedServiceInvoice },
  ])

  // POD: entrega confirmada en cada tramo (tarea "entrega" → exige fecha real) Y evidencia documental
  push("cierre", "Cierre / POD", [
    { label: "Entrega confirmada en cada tramo", ok: entregaTasks.length > 0 && entregaTasks.every((t) => t.status === "done") },
    { label: "Evidencia documental cargada (POD/acuse)", ok: docCount > 0 },
    { label: "Todos los gastos con comprobante (factura o documento)", ok: expensesAllHaveEvidence },
  ])

  const block = (key: string) => blocks.find((b) => b.key === key)!
  const fails = (key: string) => (block(key).ok ? [] : block(key).checks.filter((x) => !x.ok).map((x) => `${block(key).title}: ${x.label}`))

  // ── Compuertas por estado destino (dónde van los candados) ──
  // confirmed: cliente + ruta + cotización aceptada
  // in_transit: + mercancía + transporte + Carta Porte (si foráneo)
  // delivered: + cierre/POD
  const confirmedMissing = [...fails("cliente"), ...fails("ruta"), ...fails("cotizacion")]
  const inTransitMissing = [...confirmedMissing, ...fails("mercancia"), ...fails("transporte"), ...(hasForaneo ? fails("carta_porte") : [])]
  const deliveredMissing = [...inTransitMissing, ...fails("cierre")]

  const gates: ShipmentReadiness["gates"] = {
    confirmed: { ok: confirmedMissing.length === 0, missing: confirmedMissing },
    in_transit: { ok: inTransitMissing.length === 0, missing: inTransitMissing },
    delivered: { ok: deliveredMissing.length === 0, missing: deliveredMissing },
  }

  // ── Siguiente acción recomendada (orden operativo real del flete terrestre) ──
  // cliente → ruta básica → mercancía → cotización → transporte autorizado → CP → factura → POD
  let nextAction: ShipmentReadiness["nextAction"] = null
  if (!block("cliente").ok) nextAction = { label: "Completa los datos del cliente", hint: "Régimen, CP fiscal, razón social y contacto" }
  else if (legs.length === 0) nextAction = { label: "Planea los tramos", hint: "Define la ruta: agrega al menos un tramo" }
  else if (!block("ruta").ok) nextAction = { label: "Completa origen y destino de los tramos", hint: "CP de origen y destino por tramo" }
  else if (merchandise.length === 0) nextAction = { label: "Captura la mercancía", hint: "Qué se transporta (peso y clave SAT)" }
  else if (!quoteHasCharges) nextAction = { label: "Cotiza el servicio", hint: "Agrega los cargos al cliente en el paso Cotizar" }
  else if (quote?.status !== "accepted") nextAction = { label: "Marca la cotización como aceptada", hint: "Confirma la tarifa con el cliente" }
  else if (!block("transporte").ok) nextAction = { label: "Asigna transporte a los tramos", hint: "Transportista, unidad y operador autorizados por tramo" }
  else if (hasForaneo && !block("carta_porte").ok) nextAction = { label: "Timbra la Carta Porte", hint: "Por cada unidad de los tramos foráneos" }
  else if (!hasServiceInvoice) nextAction = { label: "Genera la factura del servicio", hint: "Desde la cotización, en el paso Facturar" }
  else if (!stampedServiceInvoice) nextAction = { label: "Timbra la factura del servicio", hint: "En el paso Facturar" }
  else if (!block("cierre").ok) nextAction = { label: "Confirma la entrega (POD)", hint: "Marca la entrega de cada tramo y carga la evidencia documental" }

  return { blocks, hasForaneo, gates, nextAction, locked }
}
