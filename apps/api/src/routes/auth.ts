import type { FastifyInstance } from "fastify"
import { auth } from "../lib/auth.js"


export async function authRoutes(app: FastifyInstance) {
  // Better-auth maneja todos los endpoints bajo /api/auth/*
  // (login, logout, session, register, etc.)
  app.all("/api/auth/*", async (request, reply) => {
    // Convertir request de Node a Web API Request que espera better-auth
    const url = `${request.protocol}://${request.hostname}${request.url}`
    const webRequest = new Request(url, {
      method: request.method,
      headers: request.headers as unknown as HeadersInit,
      body: ["GET", "HEAD"].includes(request.method) ? null : JSON.stringify(request.body),
    })

    const response = await auth.handler(webRequest)
    reply.status(response.status)
    response.headers.forEach((value, key) => {
      reply.header(key, value)
    })
    const body = await response.text()
    return reply.send(body)
  })
}
