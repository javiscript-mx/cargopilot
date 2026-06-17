import type { FastifyReply } from "fastify"

export interface Paging {
  page: number
  pageSize: number
  skip: number
  take: number
  search: string
}

// Devuelve null si NO se pidió paginación (sin ?page) — el endpoint entonces
// devuelve la lista completa (útil para selects/dropdowns y el dashboard).
export function parsePaging(query: unknown): Paging | null {
  const q = (query ?? {}) as Record<string, unknown>
  const page = parseInt(String(q["page"] ?? ""), 10)
  if (!Number.isFinite(page) || page < 1) return null
  const rawSize = parseInt(String(q["pageSize"] ?? ""), 10)
  const pageSize = Math.min(Math.max(Number.isFinite(rawSize) ? rawSize : 20, 1), 100)
  const search = typeof q["search"] === "string" ? (q["search"] as string).trim() : ""
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, search }
}

// El total va en un header para no cambiar la forma del body (sigue siendo T[]).
export function setTotal(reply: FastifyReply, total: number): void {
  reply.header("X-Total-Count", String(total))
}

// Helper para armar un OR de "contains" insensible a mayúsculas sobre varios campos.
export function searchOr(search: string, fields: string[]): Record<string, unknown>[] | undefined {
  if (!search) return undefined
  return fields.map((field) => {
    // soporta campos anidados "customer.name"
    if (field.includes(".")) {
      const [rel, sub] = field.split(".")
      return { [rel as string]: { [sub as string]: { contains: search, mode: "insensitive" } } }
    }
    return { [field]: { contains: search, mode: "insensitive" } }
  })
}
