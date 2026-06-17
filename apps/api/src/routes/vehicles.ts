import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requireRole } from "../middleware/require-auth.js"

const VEHICLE_STATUSES = ["pending", "authorized", "suspended"] as const

const VehicleSchema = z.object({
  supplierId: z.string().cuid(),
  economicNumber: z.string().nullish(),
  plates: z.string().min(1),
  year: z.number().int().min(1900).max(2100).nullish(),
  configVehicular: z.string().nullish(),
  grossWeight: z.number().positive().nullish(),
  permSct: z.string().nullish(),
  permSctNumber: z.string().nullish(),
  insurer: z.string().nullish(),
  insurancePolicy: z.string().nullish(),
  notes: z.string().nullish(),
})

export async function vehiclesRoutes(app: FastifyInstance) {
  // Listar — filtrable por proveedor y estado (para selección en expediente)
  app.get("/vehicles", { preHandler: requireAuth }, async (request, reply) => {
    const { supplierId, status, active } = request.query as {
      supplierId?: string; status?: string; active?: string
    }
    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...(supplierId ? { supplierId } : {}),
        ...(status ? { status } : {}),
        ...(active !== undefined ? { active: active === "true" } : {}),
      },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(vehicles)
  })

  app.post("/vehicles", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const body = VehicleSchema.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const supplier = await prisma.supplier.findUnique({ where: { id: body.data.supplierId } })
    if (!supplier) return reply.status(404).send({ error: "Proveedor no encontrado" })
    const vehicle = await prisma.vehicle.create({
      data: {
        ...body.data,
        economicNumber: body.data.economicNumber ?? null,
        year: body.data.year ?? null,
        configVehicular: body.data.configVehicular ?? null,
        grossWeight: body.data.grossWeight ?? null,
        permSct: body.data.permSct ?? null,
        permSctNumber: body.data.permSctNumber ?? null,
        insurer: body.data.insurer ?? null,
        insurancePolicy: body.data.insurancePolicy ?? null,
        notes: body.data.notes ?? null,
      },
    })
    return reply.status(201).send(vehicle)
  })

  app.put("/vehicles/:id", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = VehicleSchema.partial().safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    const data = { ...body.data } as Prisma.VehicleUpdateInput
    const vehicle = await prisma.vehicle.update({ where: { id }, data })
    return reply.send(vehicle)
  })

  // Cambiar estado de autorización (admin)
  app.patch("/vehicles/:id/status", { preHandler: requireRole("admin") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { status } = (request.body ?? {}) as { status?: string }
    if (!status || !VEHICLE_STATUSES.includes(status as (typeof VEHICLE_STATUSES)[number])) {
      return reply.status(400).send({ error: "Estado inválido (pending, authorized, suspended)" })
    }
    const vehicle = await prisma.vehicle.update({ where: { id }, data: { status } })
    return reply.send(vehicle)
  })

  // Baja lógica (conserva referencias históricas en expedientes)
  app.delete("/vehicles/:id", { preHandler: requireRole("admin", "operator") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    await prisma.vehicle.update({ where: { id }, data: { active: false } })
    return reply.status(204).send()
  })
}
