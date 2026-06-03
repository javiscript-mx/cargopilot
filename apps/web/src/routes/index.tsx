import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Package, Building2, FileText, TrendingUp } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { invoicesApi } from "@/api/invoices"

export const Route = createFileRoute("/")({
  component: DashboardPage,
})

function StatCard({ title, value, icon: Icon, description }: {
  title: string
  value: number | string
  icon: React.ElementType
  description?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-[--color-muted-foreground]">{title}</CardTitle>
          <Icon className="h-4 w-4 text-[--color-muted-foreground]" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {description && <p className="mt-1 text-xs text-[--color-muted-foreground]">{description}</p>}
      </CardContent>
    </Card>
  )
}

function DashboardPage() {
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments"], queryFn: shipmentsApi.list })
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: invoicesApi.list })

  const activeShipments = shipments.filter((s) => !["delivered", "cancelled"].includes(s.status))
  const stampedInvoices = invoices.filter((i) => i.status === "stamped")
  const totalBilled = stampedInvoices.reduce((acc, i) => acc + parseFloat(i.total), 0)

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-[--color-muted-foreground]">Resumen de operaciones</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Expedientes activos"
          value={activeShipments.length}
          icon={Package}
          description={`${shipments.length} en total`}
        />
        <StatCard
          title="Clientes"
          value={customers.length}
          icon={Building2}
        />
        <StatCard
          title="Facturas timbradas"
          value={stampedInvoices.length}
          icon={FileText}
          description={`${invoices.length} en total`}
        />
        <StatCard
          title="Total facturado"
          value={`$${totalBilled.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          description="Facturas timbradas"
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">Expedientes recientes</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Origen → Destino</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shipments.slice(0, 5).map((s) => (
                  <tr key={s.id} className="border-b border-[--color-border] last:border-0">
                    <td className="px-4 py-3 font-mono font-medium">{s.folio}</td>
                    <td className="px-4 py-3">{s.customer.name}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">{s.origin} → {s.destination}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
                {shipments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[--color-muted-foreground]">
                      No hay expedientes aún
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-700" },
  confirmed: { label: "Confirmado", color: "bg-blue-100 text-blue-700" },
  in_transit: { label: "En tránsito", color: "bg-yellow-100 text-yellow-700" },
  delivered: { label: "Entregado", color: "bg-green-100 text-green-700" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-700" },
}

function StatusBadge({ status }: { status: string }) {
  const { label, color } = statusLabels[status] ?? { label: status, color: "bg-gray-100 text-gray-700" }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  )
}
