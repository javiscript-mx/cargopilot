import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"
import { createCFDI, cancelCFDI, getCFDIPdf, getCFDIXml } from "../lib/facturama.js"

const CreateInvoiceSchema = z.object({
  customerId: z.string(),
  shipmentId: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
      productCode: z.string().default("78101800"), // Transporte de carga
      unitCode: z.string().default("E48"),
    }),
  ),
  cfdiUse: z.string().default("G03"),
  paymentForm: z.string().default("03"),
  series: z.string().default("A"),
})

export async function invoicesRoutes(app: FastifyInstance) {
  app.get("/invoices", { preHandler: requireAuth }, async (_request, reply) => {
    const invoices = await prisma.invoice.findMany({
      include: { customer: { select: { id: true, name: true, rfc: true } } },
      orderBy: { createdAt: "desc" },
    })
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

      const count = await prisma.invoice.count({ where: { series: body.data.series } })
      const folio = String(count + 1).padStart(5, "0")

      const invoice = await prisma.invoice.create({
        data: {
          series: body.data.series,
          folio,
          customerId: body.data.customerId,
          shipmentId: body.data.shipmentId ?? null,
          cfdiUse: body.data.cfdiUse,
          subtotal,
          tax,
          total,
        },
      })

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

      const { items } = request.body as {
        items: {
          description: string
          quantity: number
          unitPrice: number
          productCode: string
          unitCode: string
        }[]
      }

      const taxZipCode = process.env["EMISOR_CP"] ?? "06600"

      const payload = {
        Serie: invoice.series,
        Currency: "MXN",
        ExpeditionPlace: taxZipCode,
        PaymentForm: "03",
        PaymentMethod: "PUE",
        CfdiType: "I" as const,
        Receiver: {
          Rfc: invoice.customer.rfc,
          Name: invoice.customer.name,
          CfdiUse: invoice.cfdiUse,
          FiscalRegime: "616",
          TaxZipCode: taxZipCode,
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

      const result = await createCFDI(payload)

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          status: "stamped",
          facturamaid: result.Id,
          stampedAt: new Date(),
        },
      })

      // Guardar XML en background (no bloqueamos la respuesta)
      getCFDIXml(result.Id)
        .then((xmlBase64) => {
          const xml = Buffer.from(xmlBase64, "base64").toString("utf-8")
          return prisma.invoice.update({ where: { id }, data: { xmlContent: xml } })
        })
        .catch(console.error)

      return reply.send(updated)
    },
  )

  // Descargar PDF
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

  // Cancelar factura
  app.post(
    "/invoices/:id/cancel",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { motive = "02" } = (request.body as { motive?: string }) ?? {}

      const invoice = await prisma.invoice.findUnique({ where: { id } })
      if (!invoice) return reply.status(404).send({ error: "Factura no encontrada" })
      if (invoice.status !== "stamped") {
        return reply.status(409).send({ error: "Solo se pueden cancelar facturas timbradas" })
      }
      if (!invoice.facturamaid) {
        return reply.status(409).send({ error: "Factura sin ID de Facturama" })
      }

      await cancelCFDI(invoice.facturamaid, motive)

      const updated = await prisma.invoice.update({
        where: { id },
        data: { status: "cancelled" },
      })

      return reply.send(updated)
    },
  )
}
