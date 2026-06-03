import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Users } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { usersApi } from "@/api/users"

export const Route = createFileRoute("/users")({
  component: UsersPage,
})

const roleConfig = {
  admin: { label: "Admin", variant: "default" as const },
  operator: { label: "Operador", variant: "outline" as const },
  viewer: { label: "Consulta", variant: "outline" as const },
}

function UsersPage() {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
  })

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <p className="text-[--color-muted-foreground]">{users.length} usuarios registrados</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Users className="h-12 w-12 opacity-30" />
              <p>No hay usuarios</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Correo</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Rol</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Alta</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const role = roleConfig[u.role as keyof typeof roleConfig] ?? { label: u.role, variant: "outline" as const }
                  return (
                    <tr key={u.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-[--color-muted-foreground]">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant={role.variant}>{role.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[--color-muted-foreground]">
                        {new Date(u.createdAt).toLocaleDateString("es-MX")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  )
}
