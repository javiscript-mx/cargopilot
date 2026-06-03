import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { FileText } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { invoicesApi, type InvoiceStatus } from "@/api/invoices"

export const Route = createFileRoute("/invoices")({
  component: InvoicesPage,
})

const statusConfig: Record<InvoiceStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

function InvoicesPage() {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: invoicesApi.list,
  })

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Facturas</h1>
        <p className="text-[--color-muted-foreground]">{invoices.length} facturas en total</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <FileText className="h-12 w-12 opacity-30" />
              <p>No hay facturas registradas</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium text-[--color-muted-foreground]">Subtotal</th>
                  <th className="px-4 py-3 text-right font-medium text-[--color-muted-foreground]">IVA</th>
                  <th className="px-4 py-3 text-right font-medium text-[--color-muted-foreground]">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Estado</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = statusConfig[inv.status] ?? { label: inv.status, variant: "outline" as const }
                  return (
                    <tr key={inv.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                      <td className="px-4 py-3 font-mono font-semibold">{inv.series}-{inv.folio}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{inv.customer.name}</div>
                        <div className="text-xs text-[--color-muted-foreground]">{inv.customer.rfc}</div>
                      </td>
                      <td className="px-4 py-3 text-right">${parseFloat(inv.subtotal).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">${parseFloat(inv.tax).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-semibold">${parseFloat(inv.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-[--color-muted-foreground]">
                        {new Date(inv.createdAt).toLocaleDateString("es-MX")}
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
