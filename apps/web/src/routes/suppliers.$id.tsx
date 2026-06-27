import { createFileRoute, Outlet } from "@tanstack/react-router"

// Layout del proveedor: solo renderiza la ruta hija (índice = detalle, edit = edición).
// Necesario para que /suppliers/$id/edit funcione (patrón layout + index del proyecto).
export const Route = createFileRoute("/suppliers/$id")({
  component: () => <Outlet />,
})
