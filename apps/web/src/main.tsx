import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter, RouterProvider } from "@tanstack/react-router"
import "./index.css"

import { routeTree } from "./routeTree.gen"
import { ToastProvider } from "@/components/ui/toast"
import { ConfirmProvider } from "@/components/ui/confirm"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime 0 ⇒ los datos se revalidan al montar (al navegar a una vista),
      // así un dato que completaste en otra pantalla ya se ve al volver (sin "borrar cache").
      // Los catálogos/settings ponen su propio staleTime alto y no se ven afectados.
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById("root")!
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
