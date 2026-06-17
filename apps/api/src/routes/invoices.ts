import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"
import { createCFDI, cancelCFDI, getCFDIPdf, getCFDIXml } from "../lib/facturama.js"
import { withFolioRetry, folioNumber } from "../lib/folio.js"
import { parsePaging, setTotal, searchOr } from "../lib/pagination.js"

const InvoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  productCode: z.string().default("78101800"), // Transporte de carga
  unitCode: z.string().default("E48"),
})
type InvoiceItem = z.infer<typeof InvoiceItemSchema>

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
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const body = CreateInvoiceSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      const customer = await prisma.customer.findUnique({ where: { id: body.data.customerId } })
      if (!customer) return reply.status(404).send({ error: "Cliente no encontrado" })

      const subtotal = body.data.items.reduce(
        (acc, item) => acc + item.quantity * item.unitPrice,
        0,
      )
      const tax = subtotal * 0.16
      const total = subtotal + tax

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
            total,
          },
        }),
      )

      return reply.status(201).send(invoice)
    },
  )

  // Timbrar (stamping) con Facturama
  app.post(
    "/invoices/:id/stamp",
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { customer: true },
      })

      if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
      if (invoice.status !== "draft") {
        return reply.status(409).send({ error: "Solo se pueden timbrar facturas en borrador" })
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

      const payload = {
        Serie: invoice.series,
        Currency: "MXN",
        ExpeditionPlace: expeditionPlace,
        PaymentForm: invoice.paymentForm,
        PaymentMethod: invoice.paymentMethod,
        CfdiType: "I" as const,
        Receiver: {
          Rfc: customer.rfc,
          Name: customer.name,
          CfdiUse: invoice.cfdiUse,
          FiscalRegime: customer.fiscalRegime,
          TaxZipCode: customer.fiscalZipCode,
        },
        Items: items.map((item) => {
          const subtotal = item.quantity * item.unitPrice
          const tax = subtotal * 0.16
          return {
            Quantity: item.quantity,
            ProductCode: item.productCode,
            UnitCode: item.unitCode,
            Unit: "Servicio",
            Description: item.description,
            UnitPrice: item.unitPrice,
            Subtotal: subtotal,
            TaxObject: "02",
            Taxes: [
              {
                Total: tax,
                Name: "IVA",
                Base: subtotal,
                Rate: 0.16,
                IsRetention: false,
              },
            ],
            Total: subtotal + tax,
          }
        }),
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
        },
      })

      // Intento best-effort de cachear el XML; si falla, no pasa nada:
      // el endpoint GET /invoices/:id/xml lo vuelve a pedir a Facturama on-demand.
      try {
        const xmlBase64 = await getCFDIXml(result.Id)
        await prisma.invoice.update({
          where: { id },
          data: { xmlContent: Buffer.from(xmlBase64, "base64").toString("utf-8") },
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
          await prisma.invoice.update({ where: { id }, data: { xmlContent: xml } })
        } catch (err) {
          request.log.error(err, "Error obteniendo XML de Facturama")
          return reply.status(502).send({ error: "No se pudo obtener el XML" })
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
    { preHandler: requireRole("admin") },
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
