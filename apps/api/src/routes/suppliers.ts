import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { parsePaging, setTotal, searchOr } from "../lib/pagination.js"

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/

const SupplierSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1), // references CatalogItem(category=supplier_type).code
  rfc: z.string().min(12).max(13).transform(s => s.toUpperCase()).refine((v) => RFC_REGEX.test(v), "RFC con formato inválido").nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  contact: z.string().nullish(),
  address: z.record(z.string(), z.unknown()).nullish(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
})

export async function suppliersRoutes(app: FastifyInstance) {
  app.get("/suppliers", { preHandler: requireAuth }, async (request, reply) => {
    const paging = parsePaging(request.query)
    if (!paging) {
      const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } })
      return reply.send(suppliers)
    }
    const where = paging.search ? { OR: searchOr(paging.search, ["name", "rfc", "contact"]) } : {}
    const [total, suppliers] = await prisma.$transaction([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, orderBy: { name: "asc" }, skip: paging.skip, take: paging.take }),
    ])
    setTotal(reply, total)
    return reply.send(suppliers)
  })

  app.get("/suppliers/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const supplier = await prisma.supplier.findUnique({ where: { id } })
    if (!supplier) return reply.status(404).send({ error: "Proveedor no encontrado" })
    return reply.send(supplier)
  })

  app.post(
    "/suppliers",
    { preHandler: requirePermission("suppliers.write") },
    async (request, reply) => {
      const body = SupplierSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const supplier = await prisma.supplier.create({
        data: {
          ...body.data,
          rfc: body.data.rfc ?? null,
          email: body.data.email ?? null,
          phone: body.data.phone ?? null,
          contact: body.data.contact ?? null,
          notes: body.data.notes ?? null,
          address: body.data.address ? (body.data.address as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      })
      return reply.status(201).send(supplier)
    },
  )

  app.put(
    "/suppliers/:id",
    { preHandler: requirePermission("suppliers.write") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = SupplierSchema.partial().safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const supplier = await prisma.supplier.update({
        where: { id },
        data: {
          ...body.data,
          rfc: body.data.rfc ?? null,
          email: body.data.email ?? null,
          phone: body.data.phone ?? null,
          contact: body.data.contact ?? null,
          notes: body.data.notes ?? null,
          address: body.data.address !== undefined
            ? body.data.address
              ? (body.data.address as Prisma.InputJsonValue)
              : Prisma.JsonNull
            : undefined,
        },
      })
      return reply.send(supplier)
    },
  )

  // Baja LÓGICA (active=false), no borrado físico: conserva el historial — el
  // proveedor aparece como carrier en tramos/expedientes y tiene unidades/operadores
  // referenciados (Carta Porte). Coherente con la baja de vehicles/operators.
  app.delete(
    "/suppliers/:id",
    { preHandler: requirePermission("suppliers.delete") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true } })
      if (!supplier) return reply.status(404).send({ error: "Proveedor no encontrado" })
      await prisma.supplier.update({ where: { id }, data: { active: false } })
      return reply.status(204).send()
    },
  )
}
