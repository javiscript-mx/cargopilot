import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { createCFDI, cancelCFDI, getCFDIPdf, getCFDIXml, parseCfdiIdentifiers } from "../lib/facturama.js"
import { withFolioRetry, folioNumber } from "../lib/folio.js"
import { parsePaging, setTotal, searchOr } from "../lib/pagination.js"
import { computeTaxes, personaFromRfc, isAutotransporteCarga, round2, IVA_RATE, IVA_RETENTION_RATE } from "../lib/taxes.js"
import { syncShipmentAutoTasks, syncLegAutoTasks } from "../lib/workflow.js"
import { loadCartaPorteContext, cartaPorteReadiness, buildCartaPorteComplemento } from "../lib/carta-porte.js"

const InvoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  productCode: z.string().default("78101800"), // Transporte de carga
  unitCode: z.string().default("E48"),
})
type InvoiceItem = z.infer<typeof InvoiceItemSchema>

// Importe (valor) de un concepto
const itemAmount = (i: InvoiceItem) => round2(i.quantity * i.unitPrice)

const CreateInvoiceSchema = z.object({
  customerId: z.string(),
  shipmentId: z.string().optional(),
  items: z.array(InvoiceItemSchema).min(1, "Agrega al menos un concepto"),
  cfdiUse: z.string().default("G03"),
  paymentForm: z.string().default("03"),
  paymentMethod: z.string().default("PUE"),
  series: z.string().default("A"),
})

// Lee un setting string con fallback
async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : fallback
}

export async function invoicesRoutes(app: FastifyInstance) {
  app.get("/invoices", { preHandler: requireAuth }, async (request, reply) => {
    const include = { customer: { select: { id: true, name: true, rfc: true } } }
    // Facturas de un expediente (panel de facturación dentro del proceso)
    const { shipmentId } = request.query as { shipmentId?: string }
    if (shipmentId) {
      const invoices = await prisma.invoice.findMany({ where: { shipmentId }, include, orderBy: { createdAt: "desc" } })
      return reply.send(invoices)
    }
    const paging = parsePaging(request.query)
    if (!paging) {
      const invoices = await prisma.invoice.findMany({ include, orderBy: { createdAt: "desc" } })
      return reply.send(invoices)
    }
    const where = paging.search
      ? { OR: searchOr(paging.search, ["folio", "series", "customer.name", "customer.rfc"]) }
      : {}
    const [total, invoices] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.take }),
    ])
    setTotal(reply, total)
    return reply.send(invoices)
  })

  app.get("/invoices/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { customer: true, shipment: true },
    })
    if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
    return reply.send(invoice)
  })

  // Crear factura en borrador
  app.post(
    "/invoices",
    { preHandler: requirePermission("invoices.create") },
    async (request, reply) => {
      const body = CreateInvoiceSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } })
      if (!customer) return reply.status(404).send({ error: "Cliente no encontrado" })

      // IVA 16% + retención IVA 4% (autotransporte a receptor PM). Ver lib/taxes.
      const receptor = personaFromRfc(customer.rfc)
      const { subtotal, ivaTraslado: tax, ivaRetencion: retention, total } = computeTaxes(
        body.data.items.map((item) => ({ amount: itemAmount(item), productCode: item.productCode })),
        receptor,
      )

      // Folio por serie basado en el máximo (no count): sin colisión tras borrados.
      const series = body.data.series
      const nextFolio = async () => {
        const rows = await prisma.invoice.findMany({ where: { series }, select: { folio: true } })
        const max = rows.reduce((m, r) => Math.max(m, folioNumber(r.folio)), 0)
        return String(max + 1).padStart(5, "0")
      }

      const invoice = await withFolioRetry(async () =>
        prisma.invoice.create({
          data: {
            series,
            folio: await nextFolio(),
            customerId: body.data.customerId,
            shipmentId: body.data.shipmentId ?? null,
            cfdiUse: body.data.cfdiUse,
            paymentForm: body.data.paymentForm,
            paymentMethod: body.data.paymentMethod,
            items: body.data.items as unknown as Prisma.InputJsonValue,
            subtotal,
            tax,
            retention,
            total,
          },
        }),
      )

      if (invoice.shipmentId) await syncShipmentAutoTasks(invoice.shipmentId)
      return reply.status(201).send(invoice)
    },
  )

  // Borrar una factura — SOLO borradores (las timbradas se cancelan, no se borran)
  app.delete("/invoices/:id", { preHandler: requirePermission("invoices.create") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const invoice = await prisma.invoice.findUnique({ where: { id }, select: { id: true, status: true, shipmentId: true } })
    if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
    if (invoice.status !== "draft") {
      return reply.status(409).send({ error: "Solo se pueden borrar facturas en borrador. Las timbradas se cancelan." })
    }
    await prisma.invoice.delete({ where: { id } })
    if (invoice.shipmentId) await syncShipmentAutoTasks(invoice.shipmentId)
    return reply.status(204).send()
  })

  // Timbrar (stamping) con Facturama
  app.post(
    "/invoices/:id/stamp",
    { preHandler: requirePermission("invoices.stamp") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      // Opcional: adjuntar el complemento Carta Porte del transporte de una unidad (tramo).
      // Coexiste con el timbrado de CP por unidad; aquí la MISMA factura de servicio lo lleva.
      const stampBody = z.object({ cartaPorte: z.object({ legVehicleId: z.string() }).optional() }).safeParse(request.body ?? {})
      if (!stampBody.success) return reply.status(400).send({ error: stampBody.error.flatten() })
      const ccpUnitId = stampBody.data.cartaPorte?.legVehicleId

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { customer: true },
      })

      if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
      if (invoice.status !== "draft") {
        return reply.status(409).send({ error: "Solo se pueden timbrar facturas en borrador" })
      }

      // ── Complemento Carta Porte (si se pidió): validar ANTES de armar el CFDI ──
      let complemento: ReturnType<typeof buildCartaPorteComplemento> | null = null
      let ccpCtx: Awaited<ReturnType<typeof loadCartaPorteContext>> = null
      if (ccpUnitId) {
        ccpCtx = await loadCartaPorteContext(ccpUnitId)
        if (!ccpCtx) return reply.status(404).send({ error: "Unidad de transporte no encontrada para la Carta Porte" })
        if (ccpCtx.leg.shipmentId !== invoice.shipmentId) {
          return reply.status(422).send({ error: "La unidad de Carta Porte no pertenece a este expediente." })
        }
        if (ccpCtx.unit.cartaPorteInvoiceId) {
          return reply.status(409).send({ error: "Esa unidad ya tiene una Carta Porte timbrada (no se puede duplicar el complemento)." })
        }
        const readiness = cartaPorteReadiness(ccpCtx)
        if (!readiness.ready) {
          const missing = readiness.groups.flatMap((g) => g.items.filter((i) => !i.ok).map((i) => `${g.group}: ${i.label}`))
          return reply.status(422).send({ error: "Faltan datos para la Carta Porte", missing })
        }
        complemento = buildCartaPorteComplemento(ccpCtx)
      }

      // Conceptos: SIEMPRE desde la BD (no del request) — son los del borrador
      const items = (invoice.items as unknown as InvoiceItem[] | null) ?? []
      if (items.length === 0) {
        return reply.status(422).send({ error: "La factura no tiene conceptos para timbrar" })
      }

      // Datos fiscales del receptor (obligatorios en CFDI 4.0)
      const { customer } = invoice
      if (!customer.fiscalRegime || !customer.fiscalZipCode) {
        return reply.status(422).send({
          error: "El cliente no tiene régimen fiscal y/o CP fiscal. Complétalos en el cliente para poder timbrar.",
        })
      }

      // Datos del emisor (lugar de expedición) desde Configuración
      const expeditionPlace = await getSetting("invoicing.emisorCp", process.env["EMISOR_CP"] ?? "")
      if (!expeditionPlace) {
        return reply.status(422).send({
          error: "Falta el CP del emisor. Configúralo en Configuración → Facturación.",
        })
      }

      // Nombre real de la unidad por su clave (ej. E48 → "Unidad de servicio")
      const unitCodes = [...new Set(items.map((i) => i.unitCode))]
      const unitRows = await prisma.satUnitKey.findMany({ where: { code: { in: unitCodes } }, select: { code: true, name: true } })
      const unitName = (code: string) => unitRows.find((u) => u.code === code)?.name ?? "Servicio"

      // Receptor extranjero: agrega país (c_Pais) y tax id si el cliente no es MX
      const isForeign = (customer.taxCountry ?? "MX") !== "MX"
      // El receptor PM retiene 4% de IVA sobre los conceptos de autotransporte terrestre
      const receptorPersona = personaFromRfc(customer.rfc)

      // Serie para Facturama: debe estar registrada en su sucursal. Si no se configura
      // en Settings, se omite y Facturama asigna folio (evita "Serie debe existir en la sucursal").
      const facturamaSerie = await getSetting("invoicing.facturamaSerie", "")

      const payload = {
        ...(facturamaSerie ? { Serie: facturamaSerie } : {}),
        Currency: "MXN",
        ExpeditionPlace: expeditionPlace,
        PaymentForm: invoice.paymentForm,
        PaymentMethod: invoice.paymentMethod,
        CfdiType: "I" as const,
        Receiver: {
          Rfc: customer.rfc,
          Name: customer.legalName ?? customer.name,
          CfdiUse: invoice.cfdiUse,
          FiscalRegime: customer.fiscalRegime,
          TaxZipCode: customer.fiscalZipCode,
          ...(isForeign && customer.taxCountry ? { TaxResidence: customer.taxCountry } : {}),
          ...(isForeign && customer.foreignTaxId ? { NumRegIdTrib: customer.foreignTaxId } : {}),
        },
        Items: items.map((item) => {
          const subtotal = round2(item.quantity * item.unitPrice)
          const tax = round2(subtotal * IVA_RATE)
          // Retención de IVA 4% solo en autotransporte terrestre y si el receptor es PM
          const retains = receptorPersona === "moral" && isAutotransporteCarga(item.productCode)
          const retention = retains ? round2(subtotal * IVA_RETENTION_RATE) : 0
          return {
            Quantity: item.quantity,
            ProductCode: item.productCode,
            UnitCode: item.unitCode,
            Unit: unitName(item.unitCode),
            Description: item.description,
            UnitPrice: round2(item.unitPrice),
            Subtotal: subtotal,
            TaxObject: "02",
            Taxes: [
              { Total: tax, Name: "IVA", Base: subtotal, Rate: IVA_RATE, IsRetention: false },
              ...(retains ? [{ Total: retention, Name: "IVA", Base: subtotal, Rate: IVA_RETENTION_RATE, IsRetention: true }] : []),
            ],
            Total: round2(subtotal + tax - retention),
          }
        }),
        ...(complemento ? { Complemento: complemento } : {}),
      }

      let result: { Id: string }
      try {
        result = await createCFDI(payload)
      } catch (err) {
        request.log.error(err, "Error timbrando con Facturama")
        const message = err instanceof Error ? err.message : "Error al timbrar"
        return reply.status(502).send({ error: message })
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: "stamped",
          facturamaid: result.Id,
          stampedAt: new Date(),
          ...(complemento ? { kind: "invoice_cp" } : {}),
        },
      })

      // CCP en la factura: enlaza la unidad para no duplicar el complemento y marca su tarea
      if (ccpUnitId && ccpCtx) {
        await prisma.legVehicle.update({ where: { id: ccpUnitId }, data: { cartaPorteInvoiceId: updated.id } })
        await syncLegAutoTasks(ccpCtx.leg.id)
      }

      if (updated.shipmentId) await syncShipmentAutoTasks(updated.shipmentId) // facturar

      // Intento best-effort de cachear el XML y de capturar la identidad fiscal (UUID,
      // serie y folio REALES estampados por el PAC). Si falla, no pasa nada: el endpoint
      // GET /invoices/:id/xml lo vuelve a pedir a Facturama y rellena estos campos on-demand.
      try {
        const xmlBase64 = await getCFDIXml(result.Id)
        const xml = Buffer.from(xmlBase64, "base64").toString("utf-8")
        const fiscal = parseCfdiIdentifiers(xml)
        await prisma.invoice.update({
          where: { id },
          data: {
            xmlContent: xml,
            ...(fiscal.uuid ? { uuid: fiscal.uuid } : {}),
            ...(fiscal.serie ? { satSerie: fiscal.serie } : {}),
            ...(fiscal.folio ? { satFolio: fiscal.folio } : {}),
          },
        })
      } catch (err) {
        request.log.warn(err, "No se pudo cachear el XML al timbrar; se servirá on-demand")
      }

      return reply.send(updated)
    },
  )

  // Descargar PDF (siempre desde Facturama)
  app.get(
    "/invoices/:id/pdf",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const invoice = await prisma.invoice.findUnique({ where: { id } })
      if (!invoice?.facturamaid) {
        return reply.status(404).send({ error: "PDF no disponible" })
      }
      const pdfBase64 = await getCFDIPdf(invoice.facturamaid)
      const buffer = Buffer.from(pdfBase64, "base64")
      reply.header("Content-Type", "application/pdf")
      reply.header("Content-Disposition", `attachment; filename="factura-${invoice.folio}.pdf"`)
      return reply.send(buffer)
    },
  )

  // Descargar XML — usa la copia en BD; si falta, la pide a Facturama y la cachea.
  app.get(
    "/invoices/:id/xml",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const invoice = await prisma.invoice.findUnique({ where: { id } })
      if (!invoice?.facturamaid) {
        return reply.status(404).send({ error: "XML no disponible" })
      }
      let xml = invoice.xmlContent
      if (!xml) {
        try {
          const xmlBase64 = await getCFDIXml(invoice.facturamaid)
          xml = Buffer.from(xmlBase64, "base64").toString("utf-8")
          const fiscal = parseCfdiIdentifiers(xml)
          await prisma.invoice.update({
            where: { id },
            data: {
              xmlContent: xml,
              ...(fiscal.uuid ? { uuid: fiscal.uuid } : {}),
              ...(fiscal.serie ? { satSerie: fiscal.serie } : {}),
              ...(fiscal.folio ? { satFolio: fiscal.folio } : {}),
            },
          })
        } catch (err) {
          request.log.error(err, "Error obteniendo XML de Facturama")
          return reply.status(502).send({ error: "No se pudo obtener el XML" })
        }
      } else if (!invoice.uuid) {
        // XML ya cacheado pero sin identidad fiscal (timbrado antes de capturar UUID): rellena.
        const fiscal = parseCfdiIdentifiers(xml)
        if (fiscal.uuid) {
          await prisma.invoice.update({
            where: { id },
            data: {
              uuid: fiscal.uuid,
              ...(fiscal.serie ? { satSerie: fiscal.serie } : {}),
              ...(fiscal.folio ? { satFolio: fiscal.folio } : {}),
            },
          })
        }
      }
      reply.header("Content-Type", "application/xml")
      reply.header("Content-Disposition", `attachment; filename="factura-${invoice.folio}.xml"`)
      return reply.send(xml)
    },
  )

  // Cancelar factura
  app.post(
    "/invoices/:id/cancel",
    { preHandler: requirePermission("invoices.cancel") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      // Motivos SAT soportados sin folio de sustitución (el 01 requiere UUID
      // del comprobante que sustituye, fuera de alcance por ahora).
      const motive = (request.body as { motive?: string })?.motive ?? "02"
      if (!["02", "03", "04"].includes(motive)) {
        return reply.status(400).send({ error: "Motivo de cancelación inválido (02, 03 o 04)" })
      }

      const invoice = await prisma.invoice.findUnique({ where: { id } })
      if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
      if (invoice.status !== "stamped") {
        return reply.status(409).send({ error: "Solo se pueden cancelar facturas timbradas" })
      }
      if (!invoice.facturamaid) {
        return reply.status(409).send({ error: "Factura sin ID de Facturama" })
      }

      try {
        await cancelCFDI(invoice.facturamaid, motive)
      } catch (err) {
        request.log.error(err, "Error cancelando con Facturama")
        const message = err instanceof Error ? err.message : "Error al cancelar"
        return reply.status(502).send({ error: message })
      }

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: "cancelled" },
      })

      return reply.send(updated)
    },
  )
}
