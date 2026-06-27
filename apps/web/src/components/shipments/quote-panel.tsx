import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, History, Pencil, FileDown, Check, X, Send, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MoneyInput } from "@/components/ui/money-input"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { personaFromRfc } from "@/lib/fiscal"
import { computeTaxes } from "@/lib/taxes"
import { shipmentsApi } from "@/api/shipments"
import { invoicesApi } from "@/api/invoices"
import { quotesApi, type QuoteItem, type QuoteStatus } from "@/api/quotes"
import { validateDateField, todayLocal } from "@/lib/validators"

const STATUS_OPTIONS: { value: QuoteStatus; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "sent", label: "Enviada" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
]
const STATUS_VARIANT: Record<QuoteStatus, "outline" | "default" | "success" | "destructive"> = {
  draft: "outline", sent: "default", accepted: "success", rejected: "destructive",
}
const TRANSITION_TOAST: Record<QuoteStatus, string> = {
  draft: "Tarifa reabierta", sent: "Tarifa marcada como enviada", accepted: "Tarifa aprobada", rejected: "Tarifa rechazada",
}
const FALLBACK_CURRENCY = [{ value: "MXN", label: "MXN" }, { value: "USD", label: "USD" }]

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : "")

// Panel de cotización/tarifa montado dentro del drawer del paso "cotizar".
// Captura los cargos al cliente y el costo estimado para calcular el margen.
export function QuotePanel({ shipmentId, currency: shipmentCurrency }: { shipmentId: string; currency?: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canEdit = can("shipments.write")
  // Para el mensaje de "regresó a Enviada" tras editar una tarifa aceptada (regla de re-aprobación).
  const reverted = useRef(false)
  const { options: catalogCurrency } = useCatalog("currency")
  const currencyOptions = catalogCurrency.length ? catalogCurrency : FALLBACK_CURRENCY
  // Claves prodserv curadas de forwarding (mismas que usa la factura) → liga cotizado ↔ facturado
  const { options: productOptions } = useCatalog("sat_product_key")

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", shipmentId],
    queryFn: () => quotesApi.get(shipmentId),
  })
  // Persona del receptor (cliente) para la retención de IVA — 12=moral, 13=física
  const { data: shipment } = useQuery({ queryKey: ["shipments", shipmentId], queryFn: () => shipmentsApi.get(shipmentId) })
  const receptor = personaFromRfc(shipment?.customer?.rfc)
  // Conciliación: lo facturado al cliente (facturas timbradas) vs lo cotizado
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", "shipment", shipmentId], queryFn: () => invoicesApi.listByShipment(shipmentId) })
  const { data: revisions = [] } = useQuery({ queryKey: ["quote-revisions", shipmentId], queryFn: () => quotesApi.revisions(shipmentId) })

  const [form, setForm] = useState<{
    currency: string; validUntil: string; notes: string; items: QuoteItem[]
  } | null>(null)

  // Inicializa el form una vez resuelta la query (o con defaults si no hay cotización)
  const [initialized, setInitialized] = useState(false)
  // null = automático (compacto si ya hay tarifa); true/false = el usuario forzó editar/cerrar
  const [editOverride, setEditOverride] = useState<boolean | null>(null)
  const [validErr, setValidErr] = useState<string | undefined>(undefined)
  if (!isLoading && !initialized) {
    setInitialized(true)
    setForm({
      currency: quote?.currency ?? shipmentCurrency ?? "MXN",
      validUntil: toDateInput(quote?.validUntil ?? null),
      notes: quote?.notes ?? "",
      items: quote?.items?.length ? quote.items : [{ concept: "Flete", amount: 0, productKey: "78101800" }],
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const f = form!
      // El costo a nivel cotización = suma de costos por servicio (compatibilidad con resumen/readiness)
      const totalCost = f.items.reduce((a, i) => a + (Number(i.estimatedCost) || 0), 0)
      // Regla de re-aprobación (a): editar los cargos de una tarifa ACEPTADA la regresa a
      // "Enviada" y exige re-aprobarla. En cualquier otro estado el status no se toca.
      reverted.current = quote?.status === "accepted"
      return quotesApi.save(shipmentId, {
        currency: f.currency,
        validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null,
        estimatedCost: totalCost || null,
        notes: f.notes.trim() || null,
        items: f.items.filter((i) => i.concept.trim() || i.amount).map((i) => ({
          concept: i.concept.trim(),
          amount: Number(i.amount) || 0,
          ...(i.productKey ? { productKey: i.productKey } : {}),
          ...(i.estimatedCost ? { estimatedCost: Number(i.estimatedCost) } : {}),
        })),
        ...(reverted.current ? { status: "sent" as QuoteStatus } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["quote-revisions", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      if (reverted.current) toast.success("Tarifa guardada — regresó a 'Enviada', vuelve a aprobarla")
      else toast.success("Cotización guardada")
    },
    onError: (err: Error) => toast.error("No se pudo guardar la cotización", err.message),
  })

  // Transición de estado del ciclo de la tarifa — acción explícita, separada de editar los cargos.
  const transition = useMutation({
    mutationFn: (status: QuoteStatus) => quotesApi.save(shipmentId, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["quote", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["quote-revisions", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      toast.success(TRANSITION_TOAST[status])
    },
    onError: (err: Error) => toast.error("No se pudo actualizar el estado", err.message),
  })

  if (isLoading || !form) {
    return <div className="rounded-md border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted-foreground)]">Cargando cotización...</div>
  }

  const tax = computeTaxes(form.items.map((i) => ({ amount: Number(i.amount) || 0, productCode: i.productKey })), receptor)
  const sellTotal = tax.subtotal
  const cost = form.items.reduce((a, i) => a + (Number(i.estimatedCost) || 0), 0)
  const margin = sellTotal - cost
  const marginPct = sellTotal > 0 ? (margin / sellTotal) * 100 : 0
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: form.currency })

  // Conciliación cotizado ↔ facturado (subtotales, sin IVA). Facturas timbradas = lo ya facturado.
  const stampedInvoices = invoices.filter((i) => i.status === "stamped")
  const facturado = stampedInvoices.reduce((a, i) => a + parseFloat(i.subtotal), 0)
  const pendientePorFacturar = sellTotal - facturado
  const facturadoPct = sellTotal > 0 ? Math.min(100, (facturado / sellTotal) * 100) : 0

  const setItem = (idx: number, patch: Partial<QuoteItem>) =>
    setForm((f) => f && { ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })

  // Vista compacta por defecto cuando ya hay tarifa guardada; se expande al editar.
  const savedHasCharges = (quote?.items ?? []).some((i) => Number(i.amount) > 0)
  const isEditing = editOverride ?? !savedHasCharges
  // Estado del CICLO de la tarifa (lo guardado, no el form de edición de cargos).
  const savedStatus: QuoteStatus = quote?.status ?? "draft"
  const acceptedRev = revisions.find((r) => r.status === "accepted")
  const acceptedAt = savedStatus === "accepted" && acceptedRev ? new Date(acceptedRev.createdAt) : null
  const busy = transition.isPending

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Cotización / tarifa</h4>
        <div className="flex items-center gap-2">
          {savedHasCharges && !isEditing && (
            <Button type="button" size="sm" variant="outline" title="Descargar cotización en PDF"
              onClick={() => window.open(quotesApi.pdfUrl(shipmentId), "_blank", "noopener")}>
              <FileDown className="h-3 w-3" /> PDF
            </Button>
          )}
          {canEdit && (
            isEditing
              ? (savedHasCharges && <Button type="button" size="sm" variant="outline" onClick={() => setEditOverride(false)}>Listo</Button>)
              : <Button type="button" size="sm" variant="outline" onClick={() => setEditOverride(true)}><Pencil className="h-3 w-3" /> Editar tarifa</Button>
          )}
        </div>
      </div>

      {/* Barra de estado / aprobación — el ciclo de la tarifa como acciones explícitas
          (aprobar NO requiere editar). */}
      {savedHasCharges && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2">
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[savedStatus]}>{STATUS_OPTIONS.find((s) => s.value === savedStatus)?.label}</Badge>
            {acceptedAt && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                Aceptada el {acceptedAt.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
          {canEdit && !isEditing && (
            <div className="flex items-center gap-2">
              {savedStatus === "draft" && (
                <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => transition.mutate("sent")}>
                  <Send className="h-3 w-3" /> Marcar como enviada
                </Button>
              )}
              {savedStatus === "sent" && (<>
                <Button type="button" size="sm" variant="outline" loading={busy}
                  onClick={async () => { if (await confirm({ title: "Rechazar tarifa", description: "La tarifa quedará marcada como rechazada. Podrás reabrirla después.", destructive: true, confirmLabel: "Rechazar" })) transition.mutate("rejected") }}>
                  <X className="h-3 w-3" /> Rechazar
                </Button>
                <Button type="button" size="sm" loading={busy}
                  onClick={async () => { if (await confirm({ title: "Aprobar tarifa", description: `Confirmas que el cliente aceptó la tarifa por ${money(tax.total)}. Esto autoriza continuar con el servicio.`, confirmLabel: "Aprobar tarifa" })) transition.mutate("accepted") }}>
                  <Check className="h-3 w-3" /> Aprobar tarifa
                </Button>
              </>)}
              {savedStatus === "accepted" && (
                <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => transition.mutate("sent")}>
                  <RotateCcw className="h-3 w-3" /> Reabrir
                </Button>
              )}
              {savedStatus === "rejected" && (
                <Button type="button" size="sm" variant="outline" loading={busy} onClick={() => transition.mutate("draft")}>
                  <RotateCcw className="h-3 w-3" /> Reabrir
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {isEditing && (<>
      <div className="grid grid-cols-2 gap-3">
        <Select id="q-currency" label="Moneda" options={currencyOptions} value={form.currency} onChange={(e) => setForm((f) => f && { ...f, currency: e.target.value })} disabled={!canEdit} />
        <Input id="q-valid" label="Vigencia" type="date" min={todayLocal()} value={form.validUntil} onChange={(e) => { setValidErr(undefined); setForm((f) => f && { ...f, validUntil: e.target.value }) }} disabled={!canEdit} error={validErr} />
      </div>

      {/* Cargos al cliente */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-medium">Cargos al cliente</span>
          {canEdit && (
            <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => f && { ...f, items: [...f.items, { concept: "", amount: 0, productKey: "78101800" }] })}>
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {form.items.map((it, idx) => {
            const itMargin = (Number(it.amount) || 0) - (Number(it.estimatedCost) || 0)
            return (
            <div key={idx} className="flex flex-col gap-1.5 rounded-md border border-[var(--color-border)] p-2">
              <div className="flex items-center gap-2">
                <Input id={`q-c-${idx}`} className="flex-1" placeholder="Concepto (flete, maniobras, casetas...)" value={it.concept} onChange={(e) => setItem(idx, { concept: e.target.value })} disabled={!canEdit} />
                {canEdit && (
                  <button type="button" onClick={() => setForm((f) => f && { ...f, items: f.items.filter((_, i) => i !== idx) })}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)] disabled:opacity-30"
                    disabled={form.items.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <MoneyInput id={`q-a-${idx}`} label="Venta al cliente" currency={form.currency} value={String(it.amount ?? "")} onChange={(v) => setItem(idx, { amount: Number(v) || 0 })} disabled={!canEdit} />
                <MoneyInput id={`q-cost-${idx}`} label="Costo estimado (sin IVA)" currency={form.currency} value={it.estimatedCost != null ? String(it.estimatedCost) : ""} onChange={(v) => setItem(idx, { estimatedCost: Number(v) || 0 })} disabled={!canEdit} />
              </div>
              <Select id={`q-p-${idx}`} options={productOptions} value={it.productKey ?? "78101800"}
                onChange={(e) => setItem(idx, { productKey: e.target.value })} disabled={!canEdit}
                placeholder="Clave SAT del servicio" />
              {(Number(it.amount) || Number(it.estimatedCost)) ? (
                <p className="text-right text-xs text-[var(--color-muted-foreground)]">
                  Margen del servicio: <span className={itMargin < 0 ? "font-medium text-[var(--color-destructive)]" : "font-medium text-green-600"}>{money(itMargin)}</span>
                </p>
              ) : null}
            </div>
          )})}
        </div>
      </div>
      </>)}

      {/* Resumen fiscal + utilidad real (IVA y retención son traslado/acreditables: no afectan la utilidad) */}
      <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Subtotal (venta)</span><span>{money(tax.subtotal)}</span></div>
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>IVA (16%)</span><span>{money(tax.ivaTraslado)}</span></div>
        {tax.retentionApplies && (
          <div className="flex justify-between text-[var(--color-muted-foreground)]">
            <span>Retención IVA (4% autotransporte)</span><span>− {money(tax.ivaRetencion)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-[var(--color-border)] pt-1 font-semibold">
          <span>Total a cobrar al cliente</span><span>{money(tax.total)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-[var(--color-border)] pt-2 text-[var(--color-muted-foreground)]"><span>Costo estimado total</span><span>{money(cost)}</span></div>
        <div className="flex justify-between font-semibold">
          <span>Utilidad real</span>
          <span className={margin < 0 ? "text-[var(--color-destructive)]" : "text-green-600"}>{money(margin)} · {marginPct.toFixed(1)}%</span>
        </div>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">El IVA y la retención no afectan la utilidad (son impuestos trasladados/acreditables). Captura los costos sin IVA.</p>
      </div>

      {/* Conciliación cotizado ↔ facturado (subtotales sin IVA) */}
      <div className="rounded-md border border-[var(--color-border)] p-3 text-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium">Conciliación cotizado ↔ facturado</span>
          {sellTotal > 0 && (
            <Badge variant={pendientePorFacturar <= 0.01 ? "success" : "warning"}>
              {pendientePorFacturar <= 0.01 ? "Facturado completo" : "Falta por facturar"}
            </Badge>
          )}
        </div>
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Cotizado (sin IVA)</span><span>{money(sellTotal)}</span></div>
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Facturado timbrado ({stampedInvoices.length})</span><span>{money(facturado)}</span></div>
        <div className="flex justify-between font-medium"><span>Pendiente por facturar</span><span className={pendientePorFacturar > 0.01 ? "text-amber-600" : "text-green-600"}>{money(Math.max(0, pendientePorFacturar))}</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
          <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${facturadoPct}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
          Suma de las facturas timbradas del expediente (puede ser una o varias).{pendientePorFacturar < -0.01 ? " Se facturó de más respecto a lo cotizado." : ""}
        </p>
      </div>

      {/* Historial de cambios de la cotización */}
      {revisions.length > 0 && (
        <details className="rounded-md border border-[var(--color-border)] p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-medium">
            <History className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Historial de la cotización ({revisions.length})
          </summary>
          <div className="mt-2 flex flex-col divide-y divide-[var(--color-border)]">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[var(--color-muted-foreground)]">v{r.version}</span>
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_OPTIONS.find((s) => s.value === r.status)?.label ?? r.status}</Badge>
                  <span className="text-xs text-[var(--color-muted-foreground)]">{new Date(r.createdAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <span className="font-medium tabular-nums">{Number(r.subtotal).toLocaleString("es-MX", { style: "currency", currency: r.currency })}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {isEditing && (<>
        <Input id="q-notes" label="Notas (opcional)" value={form.notes} onChange={(e) => setForm((f) => f && { ...f, notes: e.target.value })} disabled={!canEdit} />

        {canEdit && (
          <div className="flex justify-end">
            <Button type="button" size="sm" loading={save.isPending} onClick={() => {
              const err = validateDateField(form.validUntil, { notPast: true, label: "La vigencia" })
              if (err) {
                setValidErr(err)
                toast.error("Vigencia inválida", err)
                return
              }
              setValidErr(undefined)
              save.mutate()
              setEditOverride(false)
            }}>Guardar cotización</Button>
          </div>
        )}
      </>)}
    </section>
  )
}
