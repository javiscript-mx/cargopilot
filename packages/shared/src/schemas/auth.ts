import { z } from "zod"
import { ROLES } from "./common.js"

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
})

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  createdAt: z.string().datetime(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
