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

// Edición de un usuario por un admin: todos los campos opcionales (PATCH parcial)
export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
})

export const ResetPasswordSchema = z.object({
  password: z.string().min(8),
})

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  active: z.boolean(),
  createdAt: z.string().datetime(),
})

export type LoginInput = z.infer<typeof LoginSchema>
export type CreateUserInput = z.infer<typeof CreateUserSchema>
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
export type UserResponse = z.infer<typeof UserResponseSchema>
