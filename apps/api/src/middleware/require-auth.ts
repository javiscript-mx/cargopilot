import type { FastifyReply, FastifyRequest } from "fastify"
import { auth } from "../lib/auth.js"

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const session = await auth.api.getSession({ headers: request.headers as unknown as Headers })
  if (!session) {
    return reply.status(401).send({ error: "No autorizado" })
  }
  request.session = session
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply)
    if (reply.sent) return
    const userRole = request.session?.user.role
    if (!userRole || !roles.includes(userRole)) {
      return reply.status(403).send({ error: "Acceso denegado" })
    }
  }
}

// Augmentar tipos de Fastify para el session
declare module "fastify" {
  interface FastifyRequest {
    session?: Awaited<ReturnType<typeof auth.api.getSession>>
  }
}
