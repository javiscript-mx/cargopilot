import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { prisma } from "../db/client.js"

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    updateAge: 60 * 60 * 24,      // renovar si queda < 1 día
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "operator",
        input: false, // no se puede cambiar desde el cliente directamente
      },
    },
  },
})

export type Auth = typeof auth
