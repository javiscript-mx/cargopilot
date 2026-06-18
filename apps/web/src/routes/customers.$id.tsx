import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout del cliente: solo renderiza la ruta hija (índice = detalle 360, edit = edición).
// Necesario para que /customers/$id/edit funcione (patrón layout + index del proyecto).
export const Route = createFileRoute("/customers/$id")({
  component: () => <Outlet />,
})
