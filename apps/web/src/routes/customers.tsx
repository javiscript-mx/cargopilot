import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Building2, Plus } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { customersApi } from "@/api/customers"

export const Route = createFileRoute("/customers")({
  component: CustomersPage,
})

function CustomersPage() {
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: customersApi.list,
  })

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-[--color-muted-foreground]">{customers.length} clientes registrados</p>
        </div>
        <Link to="/customers/new">
          <Button><Plus className="h-4 w-4" /> Nuevo cliente</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Building2 className="h-12 w-12 opacity-30" />
              <p>No hay clientes registrados</p>
              <Link to="/customers/new"><Button><Plus className="h-4 w-4" /> Agregar primer cliente</Button></Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">RFC</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Correo</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Teléfono</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Alta</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.rfc}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">
                      {new Date(c.createdAt).toLocaleDateString("es-MX")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

    </AppLayout>
  )
}
