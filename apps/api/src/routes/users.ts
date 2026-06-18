import type { FastifyInstance } from "fastify"
import { hashPassword } from "better-auth/crypto"
import { CreateUserSchema, UpdateUserSchema, ResetPasswordSchema } from "@hm/shared"
import { prisma } from "../db/client.js"
import { requirePermission } from "../middleware/require-auth.js"
import { auth } from "../lib/auth.js"

const userSelect = {
  id: true, name: true, email: true, role: true, active: true, createdAt: true,
} as const

// ¿Es el último admin activo? Evita que el sistema quede sin administradores.
async function isLastActiveAdmin(userId: string): Promise<boolean> {
  const admins = await prisma.user.findMany({
    where: { role: "admin", active: true },
    select: { id: true },
  })
  return admins.length <= 1 && admins.some((a) => a.id === userId)
}

export async function usersRoutes(app: FastifyInstance) {
  // GET /users — ver usuarios
  app.get("/users", { preHandler: requirePermission("users.read") }, async (_request, reply) => {
    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" },
    })
    return reply.send(users)
  })

  // POST /users — crear usuario
  app.post("/users", { preHandler: requirePermission("users.manage") }, async (request, reply) => {
    const body = CreateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }
    const { name, email, password, role } = body.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: "El email ya está registrado" })
    }

    // better-auth crea el usuario y hashea el password
    const result = await auth.api.signUpEmail({ body: { name, email, password } })

    const user = await prisma.user.update({
      where: { id: result.user.id },
      data: { role },
      select: userSelect,
    })
    return reply.status(201).send(user)
  })

  // PATCH /users/:id — editar nombre, rol y estado (con protecciones)
  app.patch("/users/:id", { preHandler: requirePermission("users.manage") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = UpdateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }
    const { name, role, active } = body.data
    const isSelf = request.authUser?.id === id

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true, active: true } })
    if (!target) return reply.status(404).send({ error: "Usuario no encontrado" })

    // No puedes cambiar tu propio rol ni desactivarte (evita auto-bloqueo)
    if (isSelf && role !== undefined && role !== target.role) {
      return reply.status(400).send({ error: "No puedes cambiar tu propio rol" })
    }
    if (isSelf && active === false) {
      return reply.status(400).send({ error: "No puedes desactivar tu propia cuenta" })
    }

    // No dejes al sistema sin administradores activos
    const losesAdmin = (role !== undefined && role !== "admin") || active === false
    if (losesAdmin && target.role === "admin" && target.active && (await isLastActiveAdmin(id))) {
      return reply.status(400).send({ error: "Debe existir al menos un administrador activo" })
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(role !== undefined ? { role } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      select: userSelect,
    })

    // Al desactivar, revoca sus sesiones activas para cortar acceso de inmediato
    if (active === false) {
      await prisma.session.deleteMany({ where: { userId: id } })
    }
    return reply.send(user)
  })

  // POST /users/:id/reset-password — restablecer contraseña
  app.post("/users/:id/reset-password", { preHandler: requirePermission("users.manage") }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = ResetPasswordSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    const account = await prisma.account.findFirst({ where: { userId: id, providerId: "credential" } })
    if (!account) {
      return reply.status(404).send({ error: "El usuario no tiene credenciales de email/contraseña" })
    }

    const hashed = await hashPassword(body.data.password)
    await prisma.account.update({ where: { id: account.id }, data: { password: hashed } })

    // Invalida sesiones para forzar inicio de sesión con la nueva contraseña
    await prisma.session.deleteMany({ where: { userId: id } })
    return reply.send({ ok: true })
  })
}
