import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"

const CustomerSchema = z.object({
  name: z.string().min(2),
  rfc: z.string().min(12).max(13).toUpperCase(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zip: z.string().optional(),
      country: z.string().default("México"),
    })
    .optional(),
})

export async function customersRoutes(app: FastifyInstance) {
  app.get("/customers", { preHandler: requireAuth }, async (_request, reply) => {
    const customers = await prisma.customer.findMany({ orderBy: { name: "asc" } })
    return reply.send(customers)
  })

  app.get("/customers/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: { shipments: { orderBy: { createdAt: "desc" }, take: 10 } },
    })
    if (!customer) return reply.status(404).send({ error: "Cliente no encontrado" })
    return reply.send(customer)
  })

  app.post(
    "/customers",
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const body = CustomerSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      const existing = await prisma.customer.findUnique({ where: { rfc: body.data.rfc } })
      if (existing) {
        return reply.status(409).send({ error: "Ya existe un cliente con ese RFC" })
      }

      const customer = await prisma.customer.create({
        data: {
          ...body.data,
          email: body.data.email ?? null,
          phone: body.data.phone ?? null,
          address: body.data.address ? (body.data.address as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      })
      return reply.status(201).send(customer)
    },
  )

  app.put(
    "/customers/:id",
    { preHandler: requireRole("admin", "operator") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = CustomerSchema.partial().safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }
      const customer = await prisma.customer.update({
        where: { id },
        data: {
          ...body.data,
          email: body.data.email ?? null,
          phone: body.data.phone ?? null,
          address: body.data.address !== undefined
            ? body.data.address
              ? (body.data.address as Prisma.InputJsonValue)
              : Prisma.JsonNull
            : undefined,
        },
      })
      return reply.send(customer)
    },
  )
}
