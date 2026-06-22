import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Download, FileCode, Ban, Trash2, FileText } from "lucide-react"
import { useState } from "react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StampDialog } from "@/components/invoices/stamp-dialog"
import { CancelDialog } from "@/components/invoices/cancel-dialog"
import { invoicesApi, type Invoice, type InvoiceStatus } from "@/api/invoices"
import { useCan } from "@/lib/permissions"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"

export const Route = createFileRoute("/invoices/$id")({
  component: InvoiceDetailPage,
})

const statusConfig: Record<InvoiceStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

const money = (n: string | number | undefined) => `$${parseFloat(String(n ?? 0)).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`

function InvoiceDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canStamp = can("invoices.stamp")
  const canCancel = can("invoices.cancel")
  const canDelete = can("invoices.create")
  const [stampTarget, setStampTarget] = useState<Invoice | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)

  const { data: invoice, isLoading } = useQuery({ queryKey: ["invoices", id], queryFn: () => invoicesApi.get(id) })

  const deleteMutation = useMutation({
    mutationFn: () => invoicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Borrador eliminado")
      navigate({ to: "/invoices" })
    },
    onError: (err: Error) => toast.error("No se pudo eliminar", err.message),
  })

  if (isLoading) {
    return <AppLayout><div className="flex items-center justify-center py-20 text-[var(--color-muted-foreground)]">Cargando...</div></AppLayout>
  }
  if (!invoice) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <FileText className="h-12 w-12 opacity-30" />
          <p className="text-[var(--color-muted-foreground)]">Factura no encontrada</p>
          <Link to="/invoices"><Button variant="outline">Volver</Button></Link>
        </div>
      </AppLayout>
    )
  }

  const status = statusConfig[invoice.status] ?? { label: invoice.status, variant: "outline" as const }
  const items = invoice.items ?? []
  const retention = Number(invoice.retention ?? 0)

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/invoices" className="mb-3 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="h-4 w-4" /> Facturas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-2xl font-bold">{invoice.series}-{invoice.folio}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            {invoice.kind === "carta_porte" && <Badge variant="default">Carta Porte</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {invoice.status === "draft" && canStamp && (
              <Button size="sm" onClick={() => setStampTarget(invoice)}>Timbrar</Button>
            )}
            {invoice.status === "draft" && canDelete && (
              <Button size="sm" variant="outline" className="flex items-center gap-1.5 text-[var(--color-destructive)] hover:bg-red-50"
                loading={deleteMutation.isPending}
                onClick={async () => { if (await confirm(`¿Eliminar el borrador ${invoice.series}-${invoice.folio}?`)) deleteMutation.mutate() }}>
                <Trash2 className="h-3.5 w-3.5" /> Eliminar borrador
              </Button>
            )}
            {invoice.status === "stamped" && (
              <>
                <a href={invoicesApi.pdfUrl(invoice.id)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> PDF</Button>
                </a>
                <a href={invoicesApi.xmlUrl(invoice.id)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline" className="flex items-center gap-1.5"><FileCode className="h-3.5 w-3.5" /> XML</Button>
                </a>
                {canCancel && (
                  <Button size="sm" variant="outline" className="flex items-center gap-1.5 text-[var(--color-destructive)] hover:bg-red-50" onClick={() => setCancelTarget(invoice)}>
                    <Ban className="h-3.5 w-3.5" /> Cancelar
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Conceptos</CardTitle></CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-[var(--color-muted-foreground)]">Sin conceptos.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-foreground)]">
                      <th className="px-4 py-2 font-medium">Descripción</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">P. unit.</th>
                      <th className="px-4 py-2 text-right font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="px-4 py-2">
                          {it.description}
                          <span className="ml-1 font-mono text-xs text-[var(--color-muted-foreground)]">({it.productCode})</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{money(it.unitPrice)}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{money(it.quantity * it.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex flex-col gap-1 border-t border-[var(--color-border)] px-4 py-3 text-sm">
                <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
                <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>IVA 16%</span><span>{money(invoice.tax)}</span></div>
                {retention > 0 && (
                  <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Retención IVA</span><span>− {money(invoice.retention)}</span></div>
                )}
                <div className="mt-1 flex justify-between border-t border-[var(--color-border)] pt-1 font-semibold"><span>Total</span><span>{money(invoice.total)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Receptor</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div>
                <p className="font-medium">{invoice.customer.name}</p>
                <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{invoice.customer.rfc}</p>
              </div>
              <Row label="Uso CFDI" value={invoice.cfdiUse} />
              {invoice.paymentForm && <Row label="Forma de pago" value={invoice.paymentForm} />}
              {invoice.paymentMethod && <Row label="Método de pago" value={invoice.paymentMethod} />}
              <Row label="Creada" value={new Date(invoice.createdAt).toLocaleDateString("es-MX")} />
              {invoice.stampedAt && <Row label="Timbrada" value={new Date(invoice.stampedAt).toLocaleDateString("es-MX")} />}
              {/* Serie-folio REAL estampado por el PAC (puede diferir del folio interno del borrador) */}
              {(invoice.satSerie || invoice.satFolio) && (
                <Row label="Serie-folio CFDI" value={[invoice.satSerie, invoice.satFolio].filter(Boolean).join("-")} />
              )}
              {invoice.uuid && (
                <div className="flex flex-col gap-0.5 border-t border-[var(--color-border)] pt-2">
                  <span className="text-xs text-[var(--color-muted-foreground)]">Folio fiscal (UUID)</span>
                  <span className="font-mono text-xs break-all">{invoice.uuid}</span>
                </div>
              )}
              {invoice.shipmentId && (
                <Link to="/shipments/$id" params={{ id: invoice.shipmentId }} className="text-xs text-[var(--color-primary)] hover:underline">Ver expediente →</Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <StampDialog invoice={stampTarget} onClose={() => setStampTarget(null)} />
      <CancelDialog invoice={cancelTarget} onClose={() => setCancelTarget(null)} />
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
