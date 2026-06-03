import { createAuthClient } from "better-auth/react"

// Tipo explícito para evitar referencias internas de pnpm no portables
const authClient = createAuthClient({
  baseURL: typeof window !== "undefined"
    ? `${window.location.origin}/api/auth`
    : "http://localhost:3001/api/auth",
})

export { authClient }
export const { useSession, signIn, signOut } = authClient
