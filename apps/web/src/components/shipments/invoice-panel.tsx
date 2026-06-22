import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { FileText, Download, FileCode, Receipt, Trash2, AlertTriangle, Truck, Check, X, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { personaFromRfc, FORWARDING_CFDI_USES, cfdiUseAppliesToPersona } from "@/lib/fiscal"
import { invoicesApi, type Invoice } from "@/api/invoices"
import { quotesApi } from "@/api/quotes"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { processApi } from "@/api/process"
import { CartaPortePreviewView } from "@/components/shipments/carta-porte-preview"

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
  const confirm = useConfirm()
  const { can } = useCan()
  const canCreate = can("invoices.create")
  const canStamp = can("invoices.stamp")

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["invoices", "shipment", shipmentId],
    queryFn: () => invoicesApi.listByShipment(shipmentId),
  })
  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: shipment } = useQuery({ queryKey: ["shipments", shipmentId], queryFn: () => shipmentsApi.get(shipmentId) })
  const { data: process } = useQuery({ queryKey: ["process", shipmentId], queryFn: () => processApi.get(shipmentId) })

  // ── Complemento Carta Porte: unidades foráneas que aún no tienen CP timbrada ──
  // Si existen, la factura de servicio puede llevar el complemento del transporte.
  const ccpUnits = (process?.legs ?? [])
    .filter((l) => l.scope === "foraneo")
    .flatMap((l, idx) => l.vehicles
      .filter((v) => !v.cartaPorteInvoiceId)
      .map((v) => ({ id: v.id, label: `Tramo ${idx + 1} · ${v.vehicleLabel ?? v.carrierName ?? "unidad sin asignar"}` })))
  const [includeCcp, setIncludeCcp] = useState(false)
  const [ccpUnitId, setCcpUnitId] = useState("")
  const [showCcpPreview, setShowCcpPreview] = useState(false)
  const effUnitId = ccpUnitId || ccpUnits[0]?.id || ""
  const { data: ccp } = useQuery({
    queryKey: ["carta-porte", effUnitId],
    queryFn: () => processApi.cartaPorte(effUnitId),
    enabled: includeCcp && Boolean(effUnitId),
  })
  const ccpReady = Boolean(ccp?.ready)
  const ccpMissing = (ccp?.groups ?? []).flatMap((g) => g.items.filter((i) => !i.ok).map((i) => `${g.group}: ${i.label}`))
  const ccpActive = includeCcp && Boolean(effUnitId)

  const customerId = shipment?.customer.id
  const { data: customer } = useQuery({ queryKey: ["customers", customerId], queryFn: () => customersApi.get(customerId!), enabled: Boolean(customerId) })

  const quoteItems = (quote?.items ?? []).filter((i) => Number(i.amount) > 0)
  const quoteTotal = quoteItems.reduce((a, i) => a + Number(i.amount), 0)
  const fmt = (n: number, c = quote?.currency ?? "MXN") => n.toLocaleString("es-MX", { style: "currency", currency: c })

  // ── Conciliación cotizado ↔ facturado ──
  const stampedInvoices = invoices.filter((i) => i.status === "stamped")
  const facturado = stampedInvoices.reduce((a, i) => a + parseFloat(i.subtotal), 0)
  const pendiente = quoteTotal - facturado
  const fullyInvoiced = quoteTotal > 0 && pendiente <= 0.01
  const draft = invoices.find((i) => i.status === "draft")
  // Borrador "desactualizado": su subtotal ya no coincide con la cotización vigente
  const staleDraft = draft && Math.abs(parseFloat(draft.subtotal) - quoteTotal) > 0.01

  // ── Datos fiscales del CFDI: default inferido del cliente, pero editable ──
  const receptor = personaFromRfc(customer?.rfc)
  const { items: cfdiUseItems } = useCatalog("sat_cfdi_use")
  const { options: payFormOptions } = useCatalog("sat_payment_form")
  const { options: payMethodOptions } = useCatalog("sat_payment_method")
  const cfdiUseOptions = cfdiUseItems
    .filter((i) => FORWARDING_CFDI_USES.includes(i.code))
    .filter((i) => cfdiUseAppliesToPersona(i.extra as { moral?: boolean; physical?: boolean } | null, receptor))
    .map((i) => ({ value: i.code, label: `${i.code} – ${i.name}` }))
  const [cfdiUse, setCfdiUse] = useState<string | null>(null)
  const [payMethod, setPayMethod] = useState<string | null>(null)
  const [payForm, setPayForm] = useState<string | null>(null)
  const effCfdi = cfdiUse ?? customer?.defaultCfdiUse ?? "G03"
  const effMethod = payMethod ?? customer?.defaultPaymentMethod ?? "PUE"
  // Regla SAT: PPD ⇒ forma "99 - Por definir"
  const effForm = effMethod === "PPD" ? "99" : (payForm ?? customer?.defaultPaymentForm ?? "03")

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices", "shipment", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["invoices"] })
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  const createFromQuote = useMutation({
    mutationFn: () => {
      if (!customerId) throw new Error("El expediente no tiene cliente")
      if (!quoteItems.length) throw new Error("La cotización no tiene cargos")
      return invoicesApi.create({
        customerId,
        shipmentId,
        cfdiUse: effCfdi,
        paymentMethod: effMethod,
        paymentForm: effForm,
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
    mutationFn: (id: string) =>
      invoicesApi.stamp(id, ccpActive && ccpReady ? { cartaPorte: { legVehicleId: effUnitId } } : undefined),
    onSuccess: () => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      toast.success(ccpActive && ccpReady ? "Factura timbrada con Carta Porte" : "Factura timbrada")
    },
    onError: (err: Error) => toast.error("No se pudo timbrar la factura", err.message),
  })

  const deleteDraft = useMutation({
    mutationFn: (id: string) => invoicesApi.delete(id),
    onSuccess: () => { invalidate(); toast.success("Borrador eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar", err.message),
  })

  if (isLoading) {
    return <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">Cargando facturación...</div>
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        <h4 className="text-sm font-semibold">Facturación al cliente</h4>
      </div>

      {quoteItems.length === 0 && invoices.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Captura la cotización (paso "Cotizar") para generar la factura desde aquí, o crea una{" "}
          <Link to="/invoices/new" className="text-[var(--color-primary)] hover:underline">factura detallada</Link>.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Facturas del expediente */}
          {invoices.length > 0 && (
            <div className="flex flex-col gap-2">
              {invoices.map((inv: Invoice) => {
                const st = STATUS[inv.status] ?? STATUS["draft"]!
                return (
                  <div key={inv.id} className="flex items-center justify-between gap-2 rounded bg-[var(--color-muted)]/40 px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to="/invoices/$id" params={{ id: inv.id }} className="font-mono text-sm font-medium hover:text-[var(--color-primary)] hover:underline">{inv.series}-{inv.folio}</Link>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </div>
                      <span className="text-xs text-[var(--color-muted-foreground)]">{fmt(parseFloat(inv.total), "MXN")}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {inv.status === "draft" && canStamp && (
                        <Button size="sm" variant="outline" loading={stamp.isPending}
                          disabled={ccpActive && !ccpReady}
                          title={ccpActive && !ccpReady ? "Faltan datos de la Carta Porte para timbrar con complemento" : undefined}
                          onClick={async () => {
                            const withCp = ccpActive && ccpReady
                            const msg = withCp
                              ? `¿Timbrar ${inv.series}-${inv.folio} CON complemento Carta Porte ante el SAT?`
                              : `¿Timbrar la factura ${inv.series}-${inv.folio} ante el SAT?`
                            if (await confirm({ title: "Timbrar factura", description: msg, confirmLabel: "Timbrar" })) stamp.mutate(inv.id)
                          }}>
                          {ccpActive && ccpReady ? "Timbrar con CP" : "Timbrar"}
                        </Button>
                      )}
                      {inv.status === "draft" && canCreate && (
                        <button title="Eliminar borrador" disabled={deleteDraft.isPending}
                          onClick={async () => { if (await confirm(`¿Eliminar el borrador ${inv.series}-${inv.folio}?`)) deleteDraft.mutate(inv.id) }}
                          className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)]">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {inv.status === "stamped" && (
                        <>
                          <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer" title="PDF"
                            className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]">
                            <Download className="h-4 w-4" />
                          </a>
                          <a href={invoicesApi.xmlUrl(inv.id)} target="_blank" rel="noreferrer" title="XML"
                            className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]">
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

          {/* Complemento Carta Porte en la factura (cuando hay transporte foráneo sin CP) */}
          {draft && canStamp && ccpUnits.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={includeCcp} onChange={(e) => setIncludeCcp(e.target.checked)} className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" />
                <Truck className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Timbrar con complemento Carta Porte
              </label>
              {!includeCcp ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">Adjunta a esta misma factura el complemento del transporte (Ingreso + Carta Porte).</p>
              ) : (
                <>
                  <Select id="ccp-unit" label="Transporte (unidad del tramo)" options={ccpUnits.map((u) => ({ value: u.id, label: u.label }))}
                    value={effUnitId} onChange={(e) => { setCcpUnitId(e.target.value); setShowCcpPreview(false) }} />
                  <div className={`flex items-center gap-2 text-sm ${ccpReady ? "text-green-700" : "text-[var(--color-destructive)]"}`}>
                    {ccpReady ? <Check className="h-4 w-4 shrink-0" /> : <X className="h-4 w-4 shrink-0" />}
                    {ccpReady ? "Datos completos para la Carta Porte" : "Faltan datos de la Carta Porte (no se puede timbrar con CP)"}
                  </div>
                  {!ccpReady && ccpMissing.length > 0 && (
                    <ul className="ml-6 list-disc text-xs text-[var(--color-destructive)]">
                      {ccpMissing.slice(0, 8).map((m) => <li key={m}>{m}</li>)}
                    </ul>
                  )}
                  <button type="button" onClick={() => setShowCcpPreview((v) => !v)}
                    className="flex items-center gap-1 self-start text-xs font-medium text-[var(--color-primary)] hover:underline">
                    <Eye className="h-3.5 w-3.5" /> {showCcpPreview ? "Ocultar" : "Previsualizar"} complemento
                  </button>
                  {showCcpPreview && ccp?.preview && <CartaPortePreviewView p={ccp.preview} />}
                </>
              )}
            </div>
          )}

          {/* Conciliación cotizado ↔ facturado */}
          {quoteTotal > 0 && (
            <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Cotizado (sin IVA)</span><span>{fmt(quoteTotal)}</span></div>
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Facturado timbrado ({stampedInvoices.length})</span><span>{fmt(facturado)}</span></div>
              <div className="mt-0.5 flex justify-between border-t border-[var(--color-border)] pt-0.5 font-medium">
                <span>Pendiente por facturar</span>
                <span className={pendiente > 0.01 ? "text-amber-600" : "text-green-600"}>{fmt(Math.max(0, pendiente))}</span>
              </div>
              {pendiente < -0.01 && <p className="mt-1 text-xs text-[var(--color-destructive)]">Se facturó de más respecto a lo cotizado (revisar nota de crédito).</p>}
            </div>
          )}

          {/* Borrador desactualizado respecto a la cotización */}
          {staleDraft && draft && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/60 p-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>La factura borrador ({fmt(parseFloat(draft.subtotal))}) no coincide con la cotización vigente ({fmt(quoteTotal)}). Elimínala y vuelve a generarla para que cuadre.</span>
            </div>
          )}

          {/* Generar factura desde la cotización (con datos fiscales editables) */}
          {invoices.length === 0 && quoteItems.length > 0 && (
            canCreate ? (
              <div className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-3">
                <p className="text-xs font-medium">Generar factura desde la cotización (mismos servicios cotizados)</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Select id="inv-cfdi" label="Uso CFDI" options={cfdiUseOptions} value={effCfdi} onChange={(e) => setCfdiUse(e.target.value)} />
                  <Select id="inv-method" label="Método de pago" options={payMethodOptions} value={effMethod}
                    onChange={(e) => { setPayMethod(e.target.value); if (e.target.value === "PPD") setPayForm("99") }} />
                  <Select id="inv-form" label="Forma de pago" options={payFormOptions} value={effForm} onChange={(e) => setPayForm(e.target.value)} disabled={effMethod === "PPD"} />
                </div>
                <Button type="button" size="sm" loading={createFromQuote.isPending} onClick={() => createFromQuote.mutate()}>
                  <FileText className="h-3.5 w-3.5" /> Generar factura ({fmt(quoteTotal)} + IVA)
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted-foreground)]">No tienes permiso para crear facturas.</p>
            )
          )}
          {fullyInvoiced && invoices.length > 0 && (
            <p className="text-xs font-medium text-green-700">✓ El servicio cotizado ya está facturado por completo.</p>
          )}
        </div>
      )}
    </section>
  )
}
