import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

// Categorías reconocidas — extensible sin cambiar schema
export const CATALOG_CATEGORIES = [
  "supplier_type",
  "service_type",
  "transport_mode",
  "cargo_type",
  "container_type",
  "incoterm",
  "port",
  "country",
  "currency",
  "sat_product_key",
  "sat_unit_key",
  "sat_cfdi_use",
  "sat_payment_form",
  "sat_payment_method",
  "sat_tax_regime",
  "sat_cfdi_type",
] as const

export type CatalogCategory = typeof CATALOG_CATEGORIES[number]

const CatalogItemSchema = z.object({
  category: z.string().min(1),
  code: z.string().min(1).transform(s => s.toUpperCase()),
  name: z.string().min(1),
  extra: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
})

export async function catalogRoutes(app: FastifyInstance) {
  // GET /api/catalog/categories — lista de categorías disponibles
  app.get("/catalog/categories", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(CATALOG_CATEGORIES)
  })

  // GET /api/catalog/items?category=xxx — ítems por categoría (o todos)
  app.get("/catalog/items", { preHandler: requireAuth }, async (request, reply) => {
    const { category, active } = request.query as { category?: string; active?: string }
    const items = await prisma.catalogItem.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(active !== undefined ? { active: active === "true" } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    })
    return reply.send(items)
  })

  // POST /api/catalog/items
  // Alta nueva. Solo puede existir un activo por (category, code).
  app.post(
    "/catalog/items",
    { preHandler: requirePermission("catalog.manage") },
    async (request, reply) => {
      const body = CatalogItemSchema.safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
      const active = await prisma.catalogItem.findFirst({
        where: { category: body.data.category, code: body.data.code, active: true },
      })
      if (active) return reply.status(409).send({ error: "Ya existe un registro activo con ese código en esta categoría" })
      const item = await prisma.catalogItem.create({
        data: {
          ...body.data,
          extra: body.data.extra ? (body.data.extra as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      })
      return reply.status(201).send(item)
    },
  )

  // Editar = baja lógica del registro viejo + alta nueva (conserva histórico).
  // La categoría no cambia; código y nombre se toman del body o del registro previo.
  app.put(
    "/catalog/items/:id",
    { preHandler: requirePermission("catalog.manage") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = CatalogItemSchema.partial().safeParse(request.body)
      if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

      const existing = await prisma.catalogItem.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: "Ítem no encontrado" })

      const nextCode = body.data.code ?? existing.code
      const nextName = body.data.name ?? existing.name
      const nextExtra = body.data.extra !== undefined
        ? body.data.extra ? (body.data.extra as Prisma.InputJsonValue) : Prisma.JsonNull
        : (existing.extra as Prisma.InputJsonValue | null) ?? Prisma.JsonNull

      try {
        const [, created] = await prisma.$transaction([
          // 1) baja lógica del viejo
          prisma.catalogItem.update({ where: { id }, data: { active: false } }),
          // 2) alta nueva con los valores actualizados
          prisma.catalogItem.create({
            data: {
              category: existing.category,
              code: nextCode,
              name: nextName,
              extra: nextExtra,
              active: true,
            },
          }),
        ])
        return reply.status(201).send(created)
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return reply.status(409).send({ error: "Ya existe un registro activo con ese código en esta categoría" })
        }
        throw err
      }
    },
  )

  // Activar / desactivar (baja lógica). No borra de la BD.
  app.patch(
    "/catalog/items/:id/active",
    { preHandler: requirePermission("catalog.manage") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { active } = (request.body ?? {}) as { active?: boolean }
      if (typeof active !== "boolean") return reply.status(400).send({ error: "Campo 'active' booleano requerido" })

      const existing = await prisma.catalogItem.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: "Ítem no encontrado" })

      if (active) {
        const conflict = await prisma.catalogItem.findFirst({
          where: { category: existing.category, code: existing.code, active: true, id: { not: id } },
        })
        if (conflict) return reply.status(409).send({ error: "Ya hay un registro activo con ese código; desactívalo primero" })
      }

      const item = await prisma.catalogItem.update({ where: { id }, data: { active } })
      return reply.send(item)
    },
  )

  // "Eliminar" = baja lógica (nunca borrado físico).
  app.delete(
    "/catalog/items/:id",
    { preHandler: requirePermission("catalog.manage") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const existing = await prisma.catalogItem.findUnique({ where: { id } })
      if (!existing) return reply.status(404).send({ error: "Ítem no encontrado" })
      await prisma.catalogItem.update({ where: { id }, data: { active: false } })
      return reply.status(204).send()
    },
  )
}
