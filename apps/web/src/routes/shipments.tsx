import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Package, Plus } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { shipmentsApi, type ShipmentStatus } from "@/api/shipments"

export const Route = createFileRoute("/shipments")({
  component: ShipmentsPage,
})

const statusConfig: Record<ShipmentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  in_transit: { label: "En tránsito", variant: "warning" },
  delivered: { label: "Entregado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "destructive" },
}

function ShipmentsPage() {
  const { data: shipments = [], isLoading } = useQuery({
    queryKey: ["shipments"],
    queryFn: shipmentsApi.list,
  })

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expedientes</h1>
          <p className="text-[--color-muted-foreground]">{shipments.length} expedientes en total</p>
        </div>
        <Link to="/shipments/new">
          <Button><Plus className="h-4 w-4" /> Nuevo expediente</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Package className="h-12 w-12 opacity-30" />
              <p>No hay expedientes registrados</p>
              <Link to="/shipments/new"><Button><Plus className="h-4 w-4" /> Crear primer expediente</Button></Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Origen</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Destino</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Estado</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const status = statusConfig[s.status] ?? { label: s.status, variant: "outline" as const }
                  return (
                    <tr key={s.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                      <td className="px-4 py-3">
                        <Link to="/shipments/$id" params={{ id: s.id }} className="font-mono font-semibold text-[--color-primary] hover:underline">
                          {s.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.customer.name}</div>
                        <div className="text-xs text-[--color-muted-foreground]">{s.customer.rfc}</div>
                      </td>
                      <td className="px-4 py-3">{s.origin}</td>
                      <td className="px-4 py-3">{s.destination}</td>
                      <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-4 py-3 text-[--color-muted-foreground]">
                        {new Date(s.createdAt).toLocaleDateString("es-MX")}
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
