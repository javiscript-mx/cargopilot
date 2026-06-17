import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout del expediente: solo renderiza la ruta hija (índice = detalle, edit = edición).
// Necesario para que /shipments/$id/edit funcione (patrón layout + index del proyecto).
export const Route = createFileRoute("/shipments/$id")({
  component: () => <Outlet />,
})
