import type { FastifyInstance } from "fastify"
import { CreateUserSchema } from "@hm/shared"
import { prisma } from "../db/client.js"
import { requireRole } from "../middleware/require-auth.js"
import { auth } from "../lib/auth.js"

export async function usersRoutes(app: FastifyInstance) {
  // GET /users — solo admin
  app.get("/users", { preHandler: requireRole("admin") }, async (request, reply) => {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(users)
  })

  // POST /users — solo admin crea usuarios
  app.post("/users", { preHandler: requireRole("admin") }, async (request, reply) => {
    const body = CreateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const { name, email, password, role } = body.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: "El email ya está registrado" })
    }

    // Usamos better-auth para crear el usuario (hashea el password)
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    })

    // Asignamos el rol después de crear
    await prisma.user.update({
      where: { id: result.user.id },
      data: { role: role as "admin" | "operator" | "viewer" },
    })

    return reply.status(201).send({
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role,
    })
  })

  // PATCH /users/:id/role — solo admin cambia roles
  app.patch(
    "/users/:id/role",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { role } = request.body as { role: string }

      if (!["admin", "operator", "viewer"].includes(role)) {
        return reply.status(400).send({ error: "Rol inválido" })
      }

      const user = await prisma.user.update({
        where: { id },
        data: { role: role as "admin" | "operator" | "viewer" },
        select: { id: true, name: true, email: true, role: true },
      })

      return reply.send(user)
    },
  )
}
