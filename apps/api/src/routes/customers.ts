import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { parsePaging, setTotal, searchOr } from "../lib/pagination.js"

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/
const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"])

const CustomerContactSchema = z.object({
  type: z.string().default("operations"),
  name: z.string().min(2),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  mobile: z.string().nullish(),
  position: z.string().nullish(),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().nullish(),
})

const CustomerAddressSchema = z.object({
  type: z.string().default("commercial"),
  label: z.string().nullish(),
  address: z.record(z.string(), z.unknown()).nullish(),
  formatted: z.string().nullish(),
  street: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  country: z.string().nullish(),
  postalCode: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
  notes: z.string().nullish(),
})

const CustomerSchema = z.object({
  name: z.string().min(2),
  legalName: z.string().nullish(),
  tradeName: z.string().nullish(),
  rfc: z.string().min(12).max(13).toUpperCase().refine((v) => RFC_REGEX.test(v), "RFC con formato inválido"),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  // Acepta el objeto completo de AddressInput (formatted, street, city, lat/lng, etc.)
  address: z.record(z.string(), z.unknown()).nullish(),
  // Datos fiscales del receptor (CFDI 4.0)
  fiscalRegime: z.string().nullish(),
  fiscalZipCode: z.string().refine((v) => v === "" || /^\d{5}$/.test(v), "CP fiscal de 5 dígitos").nullish(),
  status: z.string().default("prospect"),
  customerType: z.string().default("shipper"),
  taxCountry: z.string().default("MX"),
  foreignTaxId: z.string().nullish(),
  defaultCfdiUse: z.string().nullish(),
  defaultPaymentForm: z.string().nullish(),
  defaultPaymentMethod: z.string().nullish(),
  billingEmail: z.string().email().nullish(),
  creditTermsDays: z.number().int().min(0).nullish(),
  creditLimit: z.number().min(0).nullish(),
  creditCurrency: z.string().default("MXN"),
  salesOwner: z.string().nullish(),
  operationsNotes: z.string().nullish(),
  billingNotes: z.string().nullish(),
  complianceStatus: z.string().default("pending"),
  documentsStatus: z.string().default("pending"),
  contacts: z.array(CustomerContactSchema).optional(),
  addresses: z.array(CustomerAddressSchema).optional(),
})

type CustomerInput = z.infer<typeof CustomerSchema>

const includeMaster = {
  contacts: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
  addresses: { orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }] },
}

async function findRfcConflict(rfc: string, id?: string) {
  if (GENERIC_RFCS.has(rfc)) return null
  const existing = await prisma.customer.findFirst({
    where: { rfc, ...(id ? { id: { not: id } } : {}) },
    select: { id: true },
  })
  return existing
}

function customerData(data: CustomerInput) {
  return {
    name: data.name,
    legalName: data.legalName ?? null,
    tradeName: data.tradeName ?? null,
    rfc: data.rfc,
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ? (data.address as Prisma.InputJsonValue) : Prisma.JsonNull,
    fiscalRegime: data.fiscalRegime ?? null,
    fiscalZipCode: data.fiscalZipCode ?? null,
    status: data.status,
    customerType: data.customerType,
    taxCountry: data.taxCountry,
    foreignTaxId: data.foreignTaxId ?? null,
    defaultCfdiUse: data.defaultCfdiUse ?? null,
    defaultPaymentForm: data.defaultPaymentForm ?? null,
    defaultPaymentMethod: data.defaultPaymentMethod ?? null,
    billingEmail: data.billingEmail ?? null,
    creditTermsDays: data.creditTermsDays ?? null,
    creditLimit: data.creditLimit ?? null,
    creditCurrency: data.creditCurrency,
    salesOwner: data.salesOwner ?? null,
    operationsNotes: data.operationsNotes ?? null,
    billingNotes: data.billingNotes ?? null,
    complianceStatus: data.complianceStatus,
    documentsStatus: data.documentsStatus,
  }
}

function contactRows(customerId: string, contacts: z.infer<typeof CustomerContactSchema>[] = []) {
  return contacts.map((contact) => ({
    customerId,
    type: contact.type,
    name: contact.name,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    mobile: contact.mobile ?? null,
    position: contact.position ?? null,
    isPrimary: contact.isPrimary,
    active: contact.active,
    notes: contact.notes ?? null,
  }))
}

function addressRows(customerId: string, addresses: z.infer<typeof CustomerAddressSchema>[] = []) {
  return addresses.map((address) => ({
    customerId,
    type: address.type,
    label: address.label ?? null,
    address: address.address ? (address.address as Prisma.InputJsonValue) : Prisma.JsonNull,
    formatted: address.formatted ?? null,
    street: address.street ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    country: address.country ?? null,
    postalCode: address.postalCode ?? null,
    lat: address.lat ?? null,
    lng: address.lng ?? null,
    isPrimary: address.isPrimary,
    active: address.active,
    notes: address.notes ?? null,
  }))
}

export async function customersRoutes(app: FastifyInstance) {
  app.get("/customers", { preHandler: requireAuth }, async (request, reply) => {
    const paging = parsePaging(request.query)
    if (!paging) {
      const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } })
      return reply.send(customers)
    }
    const where = paging.search ? { OR: searchOr(paging.search, ["name", "rfc", "email"]) } : {}
    const [total, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy: { name: "asc" }, skip: paging.skip, take: paging.take }),
    ])
    setTotal(reply, total)
    return reply.send(customers)
  })

  app.get("/customers/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        ...includeMaster,
        shipments: { orderBy: { createdAt: "desc" }, take: 10 },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })
    if (!customer) return reply.status(404).send({ error: "Cliente no encontrado" })

    // Exposición facturada = facturas timbradas no canceladas (proxy de saldo;
    // aún no hay módulo de pagos para calcular cuentas por cobrar reales).
    const [exposure, activeShipments] = await prisma.$transaction([
      prisma.invoice.aggregate({ where: { customerId: id, status: "stamped" }, _sum: { total: true } }),
      prisma.shipment.count({ where: { customerId: id, status: { notIn: ["delivered", "cancelled"] } } }),
    ])

    return reply.send({
      ...customer,
      billedExposure: exposure._sum.total?.toString() ?? "0",
      activeShipments,
    })
  })

  app.post(
    "/customers",
    { preHandler: requirePermission("customers.write") },
    async (request, reply) => {
      const body = CustomerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      const existing = await findRfcConflict(body.data.rfc)
      if (existing) {
        return reply.status(409).send({ error: "Ya existe un cliente con ese RFC" })
      }

      const customer = await prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({ data: customerData(body.data) })
        const contacts = contactRows(created.id, body.data.contacts)
        const addresses = addressRows(created.id, body.data.addresses)
        if (contacts.length) await tx.customerContact.createMany({ data: contacts })
        if (addresses.length) await tx.customerAddress.createMany({ data: addresses })
        return tx.customer.findUniqueOrThrow({ where: { id: created.id }, include: includeMaster })
      })
      return reply.status(201).send(customer)
    },
  )

  app.put(
    "/customers/:id",
    { preHandler: requirePermission("customers.write") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = CustomerSchema.partial().safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }
      const current = await prisma.customer.findUnique({ where: { id }, select: { rfc: true } })
      if (!current) return reply.status(404).send({ error: "Cliente no encontrado" })
      if (body.data.rfc) {
        if (body.data.rfc !== current.rfc) {
          return reply.status(409).send({ error: "El RFC no se puede editar; crea un cliente nuevo para preservar integridad fiscal" })
        }
        const existing = await findRfcConflict(body.data.rfc, id)
        if (existing) return reply.status(409).send({ error: "Ya existe un cliente con ese RFC" })
      }

      const { contacts, addresses, ...partial } = body.data
      const data = CustomerSchema.partial().parse(partial)

      const customer = await prisma.$transaction(async (tx) => {
        await tx.customer.update({
          where: { id },
          data: {
            name: data.name,
            rfc: data.rfc,
            email: data.email ?? null,
            phone: data.phone ?? null,
            legalName: data.legalName ?? null,
            tradeName: data.tradeName ?? null,
            address: data.address !== undefined
              ? data.address
                ? (data.address as Prisma.InputJsonValue)
                : Prisma.JsonNull
              : undefined,
            fiscalRegime: data.fiscalRegime ?? null,
            fiscalZipCode: data.fiscalZipCode ?? null,
            foreignTaxId: data.foreignTaxId ?? null,
            defaultCfdiUse: data.defaultCfdiUse ?? null,
            defaultPaymentForm: data.defaultPaymentForm ?? null,
            defaultPaymentMethod: data.defaultPaymentMethod ?? null,
            billingEmail: data.billingEmail ?? null,
            creditTermsDays: data.creditTermsDays ?? null,
            creditLimit: data.creditLimit ?? null,
            status: data.status,
            customerType: data.customerType,
            taxCountry: data.taxCountry,
            creditCurrency: data.creditCurrency,
            salesOwner: data.salesOwner ?? null,
            operationsNotes: data.operationsNotes ?? null,
            billingNotes: data.billingNotes ?? null,
            complianceStatus: data.complianceStatus,
            documentsStatus: data.documentsStatus,
          },
        })
        if (contacts) {
          await tx.customerContact.deleteMany({ where: { customerId: id } })
          const rows = contactRows(id, contacts)
          if (rows.length) await tx.customerContact.createMany({ data: rows })
        }
        if (addresses) {
          await tx.customerAddress.deleteMany({ where: { customerId: id } })
          const rows = addressRows(id, addresses)
          if (rows.length) await tx.customerAddress.createMany({ data: rows })
        }
        return tx.customer.findUniqueOrThrow({ where: { id }, include: includeMaster })
      })
      return reply.send(customer)
    },
  )
}
