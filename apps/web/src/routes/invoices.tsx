import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Plus, Download } from "lucide-react"
import { useState } from "react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StampDialog } from "@/components/invoices/stamp-dialog"
import { invoicesApi, type Invoice, type InvoiceStatus } from "@/api/invoices"

export const Route = createFileRoute("/invoices")({
  component: InvoicesPage,
})

const statusConfig: Record<InvoiceStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

function InvoicesPage() {
  const [stampTarget, setStampTarget] = useState<Invoice | null>(null)

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: invoicesApi.list,
  })

  return (
    <AppLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-[--color-muted-foreground]">{invoices.length} facturas en total</p>
        </div>
        <Link to="/invoices/new">
          <Button><Plus className="h-4 w-4" /> Nueva factura</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <FileText className="h-12 w-12 opacity-30" />
              <p>No hay facturas registradas</p>
              <Link to="/invoices/new"><Button><Plus className="h-4 w-4" /> Crear primera factura</Button></Link>
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
                  <th className="px-4 py-3" />
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
                      <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-4 py-3 text-[--color-muted-foreground]">
                        {new Date(inv.createdAt).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {inv.status === "draft" && (
                            <Button size="sm" variant="outline" onClick={() => setStampTarget(inv)}>
                              Timbrar
                            </Button>
                          )}
                          {inv.status === "stamped" && (
                            <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <StampDialog invoice={stampTarget} onClose={() => setStampTarget(null)} />
    </AppLayout>
  )
}
