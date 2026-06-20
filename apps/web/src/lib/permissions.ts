import { redirect } from "@tanstack/react-router"
import { roleHasPermission, type Permission } from "@hm/shared"
import { authClient, useSession } from "@/lib/auth-client"

// Gating de UI por privilegio, derivado del rol de la sesión y la matriz de @hm/shared.
// Es solo para mostrar/ocultar controles; el enforcement real vive en el API.
export function useCan() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role ?? null

  function can(permission: Permission): boolean {
    if (!role) return false
    return roleHasPermission(role, permission)
  }

  return { role, can }
}

// Guard para `beforeLoad` de rutas: redirige al inicio si el rol no tiene el privilegio.
// Defensa adicional (el enforcement real es del API) contra navegación directa por URL.
export async function ensurePermission(permission: Permission) {
  const session = await authClient.getSession()
  const role = (session.data?.user as { role?: string })?.role ?? ""
  if (!roleHasPermission(role, permission)) throw redirect({ to: "/" })
}
