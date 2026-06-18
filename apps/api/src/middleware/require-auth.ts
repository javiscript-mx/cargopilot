import type { FastifyReply, FastifyRequest } from "fastify"
import { roleHasPermission, type Permission } from "@hm/shared"
import { auth } from "../lib/auth.js"
import { prisma } from "../db/client.js"

export interface AuthUser {
  id: string
  role: string
  active: boolean
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: request.headers as unknown as Headers })
  if (!session) {
    return reply.status(401).send({ error: "No autorizado" })
  }
  request.session = session

  // Releemos rol y estado desde la BD en cada request: así un cambio de rol o
  // una desactivación surten efecto de inmediato, sin esperar a que expire la sesión.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, active: true },
  })
  if (!user) {
    return reply.status(401).send({ error: "No autorizado" })
  }
  if (!user.active) {
    return reply.status(403).send({ error: "Tu cuenta está desactivada. Contacta a un administrador." })
  }
  request.authUser = user
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply)
    if (reply.sent) return
    const userRole = request.authUser?.role
    if (!userRole || !roles.includes(userRole)) {
      return reply.status(403).send({ error: "Acceso denegado" })
    }
  }
}

// Enforcement por privilegio (modelo de producción): el rol del usuario debe
// poseer TODOS los privilegios solicitados según la matriz de @hm/shared.
export function requirePermission(...permissions: Permission[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply)
    if (reply.sent) return
    const role = request.authUser?.role
    if (!role || !permissions.every((p) => roleHasPermission(role, p))) {
      return reply.status(403).send({ error: "Acceso denegado" })
    }
  }
}

// Augmentar tipos de Fastify para session + authUser
declare module "fastify" {
  interface FastifyRequest {
    session?: Awaited<ReturnType<typeof auth.api.getSession>>
    authUser?: AuthUser
  }
}
