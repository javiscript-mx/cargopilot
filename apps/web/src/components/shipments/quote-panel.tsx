import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { quotesApi, type QuoteItem, type QuoteStatus } from "@/api/quotes"

const STATUS_OPTIONS: { value: QuoteStatus; label: string }[] = [
  { value: "draft", label: "Borrador" },
  { value: "sent", label: "Enviada" },
  { value: "accepted", label: "Aceptada" },
  { value: "rejected", label: "Rechazada" },
]
const STATUS_VARIANT: Record<QuoteStatus, "outline" | "default" | "success" | "destructive"> = {
  draft: "outline", sent: "default", accepted: "success", rejected: "destructive",
}
const FALLBACK_CURRENCY = [{ value: "MXN", label: "MXN" }, { value: "USD", label: "USD" }]

const toDateInput = (iso: string | null): string => (iso ? iso.slice(0, 10) : "")

// Panel de cotización/tarifa montado dentro del drawer del paso "cotizar".
// Captura los cargos al cliente y el costo estimado para calcular el margen.
export function QuotePanel({ shipmentId, currency: shipmentCurrency }: { shipmentId: string; currency?: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canEdit = can("shipments.write")
  const { options: catalogCurrency } = useCatalog("currency")
  const currencyOptions = catalogCurrency.length ? catalogCurrency : FALLBACK_CURRENCY
  // Claves prodserv curadas de forwarding (mismas que usa la factura) → liga cotizado ↔ facturado
  const { options: productOptions } = useCatalog("sat_product_key")

  const { data: quote, isLoading } = useQuery({
    queryKey: ["quote", shipmentId],
    queryFn: () => quotesApi.get(shipmentId),
  })

  const [form, setForm] = useState<{
    status: QuoteStatus; currency: string; validUntil: string; estimatedCost: string; notes: string; items: QuoteItem[]
  } | null>(null)

  // Inicializa el form una vez resuelta la query (o con defaults si no hay cotización)
  const [initialized, setInitialized] = useState(false)
  if (!isLoading && !initialized) {
    setInitialized(true)
    setForm({
      status: quote?.status ?? "draft",
      currency: quote?.currency ?? shipmentCurrency ?? "MXN",
      validUntil: toDateInput(quote?.validUntil ?? null),
      estimatedCost: quote?.estimatedCost ?? "",
      notes: quote?.notes ?? "",
      items: quote?.items?.length ? quote.items : [{ concept: "Flete", amount: 0, productKey: "78101800" }],
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const f = form!
      return quotesApi.save(shipmentId, {
        status: f.status,
        currency: f.currency,
        validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : null,
        estimatedCost: f.estimatedCost ? Number(f.estimatedCost) : null,
        notes: f.notes.trim() || null,
        items: f.items.filter((i) => i.concept.trim() || i.amount).map((i) => ({ concept: i.concept.trim(), amount: Number(i.amount) || 0, ...(i.productKey ? { productKey: i.productKey } : {}) })),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      toast.success("Cotización guardada")
    },
    onError: (err: Error) => toast.error("No se pudo guardar la cotización", err.message),
  })

  if (isLoading || !form) {
    return <div className="rounded-md border border-[--color-border] p-4 text-sm text-[--color-muted-foreground]">Cargando cotización...</div>
  }

  const sellTotal = form.items.reduce((acc, i) => acc + (Number(i.amount) || 0), 0)
  const cost = Number(form.estimatedCost) || 0
  const margin = sellTotal - cost
  const marginPct = sellTotal > 0 ? (margin / sellTotal) * 100 : 0
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: form.currency })

  const setItem = (idx: number, patch: Partial<QuoteItem>) =>
    setForm((f) => f && { ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[--color-border] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Cotización / tarifa</h4>
        <Badge variant={STATUS_VARIANT[form.status]}>{STATUS_OPTIONS.find((s) => s.value === form.status)?.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Select id="q-status" label="Estado" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm((f) => f && { ...f, status: e.target.value as QuoteStatus })} disabled={!canEdit} />
        <Select id="q-currency" label="Moneda" options={currencyOptions} value={form.currency} onChange={(e) => setForm((f) => f && { ...f, currency: e.target.value })} disabled={!canEdit} />
        <Input id="q-valid" label="Vigencia" type="date" value={form.validUntil} onChange={(e) => setForm((f) => f && { ...f, validUntil: e.target.value })} disabled={!canEdit} />
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
          {form.items.map((it, idx) => (
            <div key={idx} className="flex flex-col gap-1.5 rounded-md border border-[--color-border] p-2">
              <div className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
                <Input id={`q-c-${idx}`} placeholder="Concepto (flete, maniobras, casetas...)" value={it.concept} onChange={(e) => setItem(idx, { concept: e.target.value })} disabled={!canEdit} />
                <Input id={`q-a-${idx}`} type="number" min="0" step="0.01" placeholder="Monto" value={String(it.amount)} onChange={(e) => setItem(idx, { amount: Number(e.target.value) })} disabled={!canEdit} />
                {canEdit && (
                  <button type="button" onClick={() => setForm((f) => f && { ...f, items: f.items.filter((_, i) => i !== idx) })}
                    className="flex h-8 w-8 items-center justify-center rounded text-[--color-muted-foreground] hover:bg-red-50 hover:text-[--color-destructive] disabled:opacity-30"
                    disabled={form.items.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select id={`q-p-${idx}`} options={productOptions} value={it.productKey ?? "78101800"}
                onChange={(e) => setItem(idx, { productKey: e.target.value })} disabled={!canEdit}
                placeholder="Clave SAT del servicio" />
            </div>
          ))}
        </div>
      </div>

      <Input id="q-cost" label="Costo estimado (flete + casetas)" type="number" min="0" step="0.01" value={form.estimatedCost} onChange={(e) => setForm((f) => f && { ...f, estimatedCost: e.target.value })} disabled={!canEdit} />

      {/* Resumen / margen */}
      <div className="rounded-md bg-[--color-muted] p-3 text-sm">
        <div className="flex justify-between text-[--color-muted-foreground]"><span>Venta al cliente</span><span>{money(sellTotal)}</span></div>
        <div className="flex justify-between text-[--color-muted-foreground]"><span>Costo estimado</span><span>{money(cost)}</span></div>
        <div className="mt-1 flex justify-between border-t border-[--color-border] pt-1 font-semibold">
          <span>Margen</span>
          <span className={margin < 0 ? "text-[--color-destructive]" : "text-green-600"}>{money(margin)} · {marginPct.toFixed(1)}%</span>
        </div>
      </div>

      <Input id="q-notes" label="Notas (opcional)" value={form.notes} onChange={(e) => setForm((f) => f && { ...f, notes: e.target.value })} disabled={!canEdit} />

      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" size="sm" loading={save.isPending} onClick={() => save.mutate()}>Guardar cotización</Button>
        </div>
      )}
    </section>
  )
}
