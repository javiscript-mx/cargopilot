import { createRootRoute, Outlet, redirect } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"

export const Route = createRootRoute({
  beforeLoad: async ({ location }) => {
    const isLoginPage = location.pathname === "/login"
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
      const sessionPromise = authClient.getSession().then((r) => r.data)
      const session = await Promise.race([sessionPromise, timeout])
      if (!session && !isLoginPage) throw redirect({ to: "/login" })
      if (session && isLoginPage) throw redirect({ to: "/" })
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) throw err
      if (!isLoginPage) throw redirect({ to: "/login" })
    }
  },
  component: () => <Outlet />,
  errorComponent: ({ error }) => (
    <div className="p-8 text-red-600">
      <p className="font-bold">Error en la página:</p>
      <pre className="mt-2 text-sm whitespace-pre-wrap">{String(error)}</pre>
    </div>
  ),
})
