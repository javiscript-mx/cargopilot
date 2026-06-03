import { createRootRoute, Outlet, redirect } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const isLoginPage = location.pathname === "/login"
    try {
      const { data: session } = await authClient.getSession()
      if (!session && !isLoginPage) throw redirect({ to: "/login" })
      if (session && isLoginPage) throw redirect({ to: "/" })
    } catch (err) {
      // Si el error es un redirect de TanStack Router, lo re-lanzamos
      if (err && typeof err === "object" && "to" in err) throw err
      // Si la API no está disponible, mandamos al login
      if (!isLoginPage) throw redirect({ to: "/login" })
    }
  },
  component: () => <Outlet />,
})
