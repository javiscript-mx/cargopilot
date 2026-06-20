import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FileText, Download, FileCode, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useCan } from "@/lib/permissions"
import { invoicesApi, type Invoice } from "@/api/invoices"
import { quotesApi } from "@/api/quotes"
import { shipmentsApi } from "@/api/shipments"

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline"
const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

// Panel de facturación montado en el paso "facturar". Genera la factura desde la
// cotización aceptada (cero recaptura) y permite timbrar sin salir del expediente.
export function InvoicePanel({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canCreate = can("invoices.create")
  const canStamp = can("invoices.stamp")

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", "shipment", shipmentId],
    queryFn: () => invoicesApi.listByShipment(shipmentId),
  })
  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: shipment } = useQuery({ queryKey: ["shipments", shipmentId], queryFn: () => shipmentsApi.get(shipmentId) })

  const quoteItems = (quote?.items ?? []).filter((i) => Number(i.amount) > 0)
  const quoteTotal = quoteItems.reduce((a, i) => a + Number(i.amount), 0)
  const fmt = (n: number, c = quote?.currency ?? "MXN") => n.toLocaleString("es-MX", { style: "currency", currency: c })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices", "shipment", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["invoices"] })
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  const createFromQuote = useMutation({
    mutationFn: () => {
      const customerId = shipment?.customer.id
      if (!customerId) throw new Error("El expediente no tiene cliente")
      if (!quoteItems.length) throw new Error("La cotización no tiene cargos")
      return invoicesApi.create({
        customerId,
        shipmentId,
        items: quoteItems.map((i) => ({
          description: i.concept, quantity: 1, unitPrice: Number(i.amount),
          productCode: i.productKey || "78101800", unitCode: "E48",
        })),
      })
    },
    onSuccess: () => { invalidate(); toast.success("Factura borrador creada", "Desde la cotización del expediente") },
    onError: (err: Error) => toast.error("No se pudo crear la factura", err.message),
  })

  const stamp = useMutation({
    mutationFn: (id: string) => invoicesApi.stamp(id),
    onSuccess: () => { invalidate(); toast.success("Factura timbrada") },
    onError: (err: Error) => toast.error("No se pudo timbrar la factura", err.message),
  })

  if (isLoading) {
    return <div className="rounded-md border border-[--color-border] p-4 text-sm text-[--color-muted-foreground]">Cargando facturación...</div>
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[--color-border] p-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-[--color-muted-foreground]" />
        <h4 className="text-sm font-semibold">Facturación al cliente</h4>
      </div>

      {invoices.length === 0 ? (
        // Sin factura aún: generar desde la cotización
        quoteItems.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-[--color-muted] p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-[--color-muted-foreground]">Cotización del expediente</p>
              {quoteItems.map((i, idx) => (
                <div key={idx} className="flex justify-between text-[--color-muted-foreground]">
                  <span>{i.concept}</span><span>{fmt(Number(i.amount))}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-[--color-border] pt-1 font-semibold">
                <span>Subtotal</span><span>{fmt(quoteTotal)}</span>
              </div>
              <p className="mt-1 text-xs text-[--color-muted-foreground]">+ IVA 16% al timbrar</p>
            </div>
            {canCreate ? (
              <Button type="button" size="sm" loading={createFromQuote.isPending} onClick={() => createFromQuote.mutate()}>
                <FileText className="h-3.5 w-3.5" /> Generar factura desde la cotización
              </Button>
            ) : (
              <p className="text-xs text-[--color-muted-foreground]">No tienes permiso para crear facturas.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-[--color-muted-foreground]">
            Captura la cotización (paso "Cotizar") para generar la factura desde aquí, o crea una{" "}
            <Link to="/invoices/new" className="text-[--color-primary] hover:underline">factura detallada</Link>.
          </p>
        )
      ) : (
        // Ya hay factura(s): mostrarlas con acciones
        <div className="flex flex-col gap-2">
          {invoices.map((inv: Invoice) => {
            const st = STATUS[inv.status] ?? STATUS["draft"]!
            return (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded bg-[--color-muted]/40 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{inv.series}-{inv.folio}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <span className="text-xs text-[--color-muted-foreground]">{fmt(parseFloat(inv.total), "MXN")}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {inv.status === "draft" && canStamp && (
                    <Button size="sm" variant="outline" loading={stamp.isPending}
                      onClick={() => { if (confirm(`¿Timbrar la factura ${inv.series}-${inv.folio} ante el SAT?`)) stamp.mutate(inv.id) }}>
                      Timbrar
                    </Button>
                  )}
                  {inv.status === "stamped" && (
                    <>
                      <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer" title="PDF"
                        className="rounded p-1.5 text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground]">
                        <Download className="h-4 w-4" />
                      </a>
                      <a href={invoicesApi.xmlUrl(inv.id)} target="_blank" rel="noreferrer" title="XML"
                        className="rounded p-1.5 text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground]">
                        <FileCode className="h-4 w-4" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
