import { z } from "zod"

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export const IdParamSchema = z.object({
  id: z.string().uuid(),
})

export type Pagination = z.infer<typeof PaginationSchema>

export const ROLES = ["admin", "operator", "finance", "viewer"] as const
export type Role = (typeof ROLES)[number]
