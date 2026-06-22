import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Wallet } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { MoneyInput } from "@/components/ui/money-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { collectErrors, validateRequired, validateQuantity, scrollToFirstError } from "@/lib/validators"
import { PendingFilesPicker } from "@/components/ui/documents-section"
import { expensesApi, EXPENSE_STATUS, type ShipmentExpense } from "@/api/expenses"
import { documentsApi } from "@/api/documents"
import { quotesApi } from "@/api/quotes"
import { suppliersApi } from "@/api/suppliers"

// El estado del gasto (pendiente/autorizado/pagado) NO se captura aquí: se deriva del flujo
// de autorización y pagos (módulo Compras/Finanzas). Aquí solo se registra el costo.
const EMPTY = { category: "flete", concept: "", amount: "", supplierId: "", reference: "", expenseDate: "", notes: "" }

// Conciliación de costos: captura los gastos reales del expediente y los compara contra el
// costo estimado de la cotización y el ingreso, para ver la utilidad real (no estimada).
export function ExpensesPanel({ shipmentId }: { shipmentId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canEdit = can("shipments.write")
  const { simpleOptions: categoryOptions } = useCatalog("expense_category")
  const categoryLabel = (code: string) => categoryOptions.find((o) => o.value === code)?.label ?? code

  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", shipmentId], queryFn: () => expensesApi.list(shipmentId) })
  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersApi.list() })

  const currency = quote?.currency ?? "MXN"
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency })
  const supplierName = (id: string | null) => (id ? suppliers.find((s) => s.id === id)?.name ?? null : null)

  // ── P&L: ingreso vs costo estimado vs gasto real → utilidad ──
  const ingreso = (quote?.items ?? []).reduce((a, i) => a + Number(i.amount), 0)
  const costoEstimado = quote?.estimatedCost ? parseFloat(quote.estimatedCost) : 0
  const gastoReal = expenses.reduce((a, e) => a + parseFloat(e.amount), 0)
  const pagado = expenses.filter((e) => e.status === "paid").reduce((a, e) => a + parseFloat(e.amount), 0)
  const utilidadReal = ingreso - gastoReal
  const utilidadRealPct = ingreso > 0 ? (utilidadReal / ingreso) * 100 : 0
  const variacion = gastoReal - costoEstimado // + = gastaste de más que lo estimado

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["expenses", shipmentId] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        category: form.category, concept: form.concept.trim(), amount: parseFloat(form.amount) || 0,
        currency,
        supplierId: form.supplierId || null,
        expenseDate: form.expenseDate ? new Date(form.expenseDate).toISOString() : null,
        reference: form.reference || null, notes: form.notes || null,
      }
      const saved = editingId ? await expensesApi.update(editingId, payload) : await expensesApi.create(shipmentId, payload)
      // Evidencia del gasto (factura/comprobante) — se sube ligada al gasto
      for (const file of files) {
        await documentsApi.upload("expense", saved.id, file, { kind: "factura", notes: form.concept.trim() })
      }
      return saved
    },
    onSuccess: () => { invalidate(); toast.success(editingId ? "Gasto actualizado" : "Gasto agregado"); close() },
    onError: (err: Error) => toast.error("No se pudo guardar el gasto", err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: expensesApi.delete,
    onSuccess: () => { invalidate(); toast.success("Gasto eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar el gasto", err.message),
  })

  function openNew() { setEditingId(null); setForm(EMPTY); setFiles([]); setErrors({}); setShow(true) }
  function openEdit(e: ShipmentExpense) {
    setEditingId(e.id)
    setForm({
      category: e.category, concept: e.concept, amount: e.amount, supplierId: e.supplierId ?? "",
      reference: e.reference ?? "", expenseDate: e.expenseDate ? e.expenseDate.slice(0, 10) : "", notes: e.notes ?? "",
    })
    setFiles([]); setErrors({}); setShow(true)
  }
  function close() { setShow(false); setEditingId(null); setForm(EMPTY); setFiles([]); setErrors({}) }

  function handleSave(ev: React.FormEvent) {
    ev.preventDefault()
    const errs = collectErrors({
      concept: validateRequired(form.concept, "Concepto"),
      amount: validateQuantity(form.amount),
    })
    // La evidencia (folio o documento) NO es obligatoria al guardar: si falta, el gasto
    // queda "pendiente de evidencia" y se exige antes de finalizar el expediente.
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Revisa los campos marcados", "Hay datos por corregir."); scrollToFirstError(); return }
    setErrors({})
    saveMutation.mutate()
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Gastos / costos del expediente
        </h4>
        {canEdit && (
          <Button type="button" size="sm" variant="outline" className="flex items-center gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Agregar gasto
          </Button>
        )}
      </div>

      {/* P&L: ingreso − gasto real = utilidad real, con variación vs lo estimado */}
      <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Ingreso (cotizado, sin IVA)</span><span>{money(ingreso)}</span></div>
        <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Costo estimado (cotización)</span><span>{money(costoEstimado)}</span></div>
        <div className="flex justify-between text-[var(--color-muted-foreground)]">
          <span>Gasto real ({expenses.length})</span>
          <span>{money(gastoReal)} {gastoReal > 0 && <span className="text-xs">· pagado {money(pagado)}</span>}</span>
        </div>
        {costoEstimado > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-[var(--color-muted-foreground)]">Variación vs estimado</span>
            <span className={variacion > 0.01 ? "font-medium text-[var(--color-destructive)]" : "font-medium text-green-600"}>
              {variacion > 0 ? "+" : ""}{money(variacion)}
            </span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-[var(--color-border)] pt-1 font-semibold">
          <span>Utilidad real</span>
          <span className={utilidadReal < 0 ? "text-[var(--color-destructive)]" : "text-green-600"}>{money(utilidadReal)} · {utilidadRealPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Lista de gastos */}
      {expenses.length === 0 ? (
        <p className="py-2 text-center text-sm text-[var(--color-muted-foreground)]">Sin gastos registrados.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--color-border)]">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/expenses/$id" params={{ id: e.id }} className="font-medium hover:text-[var(--color-primary)] hover:underline">{e.concept}</Link>
                  <Badge variant="outline">{categoryLabel(e.category)}</Badge>
                  <Badge variant={EXPENSE_STATUS[e.status].variant}>{EXPENSE_STATUS[e.status].label}</Badge>
                  {!e.hasEvidence && <Badge variant="destructive">Sin comprobante</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--color-muted-foreground)]">
                  {supplierName(e.supplierId) && <span>{supplierName(e.supplierId)}</span>}
                  {e.reference && <span>Ref: {e.reference}</span>}
                  {e.expenseDate && <span>{new Date(e.expenseDate).toLocaleDateString("es-MX")}</span>}
                </div>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{money(parseFloat(e.amount))}</span>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button title="Editar" onClick={() => openEdit(e)} className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"><Pencil className="h-3.5 w-3.5" /></button>
                  <button title="Eliminar" onClick={async () => { if (await confirm(`¿Eliminar el gasto "${e.concept}"?`)) deleteMutation.mutate(e.id) }} className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)]"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <Drawer open={show} onClose={close} title={editingId ? "Editar gasto" : "Nuevo gasto"} description="Costo real que genera el expediente."
          footer={<div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" onClick={close}>Cancelar</Button><Button type="submit" form="expense-form" size="sm" loading={saveMutation.isPending}>{editingId ? "Guardar" : "Agregar"}</Button></div>}>
          <form id="expense-form" onSubmit={handleSave} className="flex flex-col gap-3">
            <Select id="category" label="Categoría" options={categoryOptions} value={form.category} onChange={set("category")} />
            <Input id="concept" label="Concepto" value={form.concept} onChange={set("concept")} placeholder="Flete GDL→MTY, casetas..." error={errors.concept} />
            <MoneyInput id="amount" label="Monto" currency={currency} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} error={errors.amount} />
            <Select id="supplierId" label="Proveedor (opcional)" placeholder="Sin asignar" options={suppliers.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} value={form.supplierId} onChange={set("supplierId")} />
            <div className="grid grid-cols-2 gap-3">
              <Input id="reference" label="Referencia / folio de factura" value={form.reference} onChange={set("reference")} error={errors.reference} placeholder="Folio del proveedor" />
              <Input id="expenseDate" label="Fecha (opcional)" type="date" value={form.expenseDate} onChange={set("expenseDate")} />
            </div>
            <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
            {/* Evidencia obligatoria: factura (folio arriba) o comprobante adjunto */}
            <PendingFilesPicker files={files} onChange={setFiles} disabled={saveMutation.isPending} />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Puedes guardar sin comprobante (quedará <span className="font-medium">pendiente de evidencia</span>), pero se exige el folio de factura o el documento antes de finalizar el expediente.
            </p>
          </form>
        </Drawer>
      )}
    </section>
  )
}
