import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

const OPERATOR_STATUSES = ["pending", "authorized", "suspended"] as const
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/

const OperatorSchema = z.object({
  supplierId: z.string().cuid(),
  name: z.string().min(2),
  rfc: z.string().min(12).max(13).transform((s) => s.toUpperCase()).refine((v) => RFC_REGEX.test(v), "RFC con formato inválido").nullish(),
  licenseNumber: z.string().nullish(),
  address: z.record(z.string(), z.unknown()).nullish(),
})

export async function operatorsRoutes(app: FastifyInstance) {
  app.get("/operators", { preHandler: requireAuth }, async (request, reply) => {
    const { supplierId, status, active } = request.query as {
      supplierId?: string; status?: string; active?: string
    }
    const operators = await prisma.operator.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status } : {}),
        ...(active !== undefined ? { active: active === "true" } : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(operators)
  })

  app.post("/operators", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const body = OperatorSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const supplier = await prisma.supplier.findUnique({ where: { id: body.data.supplierId } })
    if (!supplier) return reply.status(404).send({ error: "Proveedor no encontrado" })
    const operator = await prisma.operator.create({
      data: {
        supplierId: body.data.supplierId,
        name: body.data.name,
        rfc: body.data.rfc ?? null,
        licenseNumber: body.data.licenseNumber ?? null,
        address: body.data.address ? (body.data.address as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    })
    return reply.status(201).send(operator)
  })

  app.put("/operators/:id", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = OperatorSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const operator = await prisma.operator.update({
      where: { id },
      data: {
        name: body.data.name,
        rfc: body.data.rfc ?? null,
        licenseNumber: body.data.licenseNumber ?? null,
        address: body.data.address !== undefined
          ? body.data.address ? (body.data.address as Prisma.InputJsonValue) : Prisma.JsonNull
          : undefined,
      },
    })
    return reply.send(operator)
  })

  app.patch("/operators/:id/status", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = (request.body ?? {}) as { status?: string }
    if (!status || !OPERATOR_STATUSES.includes(status as (typeof OPERATOR_STATUSES)[number])) {
      return reply.status(400).send({ error: "Estado inválido (pending, authorized, suspended)" })
    }
    const operator = await prisma.operator.update({ where: { id }, data: { status } })
    return reply.send(operator)
  })

  app.delete("/operators/:id", { preHandler: requirePermission("suppliers.write") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.operator.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
