import { createFileRoute, redirect, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ShoppingCart, Search, Check, CircleDollarSign, Undo2, AlertTriangle, CalendarClock, Plus } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Dialog } from "@/components/ui/dialog"
import { Drawer } from "@/components/ui/drawer"
import { PendingFilesPicker } from "@/components/ui/documents-section"
import { useToast } from "@/components/ui/toast"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { authClient } from "@/lib/auth-client"
import { roleHasPermission } from "@hm/shared"
import { expensesApi, EXPENSE_STATUS, PAYMENT_METHODS, type ExpenseStatus, type ExpenseWithShipment, type PaymentMethod } from "@/api/expenses"
import { suppliersApi } from "@/api/suppliers"
import { shipmentsApi } from "@/api/shipments"
import { documentsApi } from "@/api/documents"
import { collectErrors, validateRequired, validateQuantity, validateDateField, findIncompleteDateInputs, scrollToFirstError } from "@/lib/validators"

const num = (s?: string | null) => parseFloat(s ?? "0") || 0
// Días hasta el vencimiento (negativo = vencido). null si no hay fecha.
function daysToDue(iso?: string | null): number | null {
  if (!iso) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(iso); due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86400000)
}

export const Route = createFileRoute("/purchases")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role ?? ""
    if (!roleHasPermission(role, "purchases.read")) throw redirect({ to: "/" })
  },
  component: PurchasesPage,
})

const STATUS_FILTER = [
  { value: "", label: "Todos los estados" },
  { value: "pending", label: "Por pagar" },
  { value: "authorized", label: "Autorizado" },
  { value: "partial", label: "Pago parcial" },
  { value: "paid", label: "Pagado" },
]

const money = (n: number, c = "MXN") => n.toLocaleString("es-MX", { style: "currency", currency: c })

type RangePreset = "month" | "year" | "all" | "custom"
interface DateRange { preset: RangePreset; from?: string; to?: string }
const isoDate = (d: Date) => d.toISOString().slice(0, 10)
function presetRange(preset: Exclude<RangePreset, "custom">): DateRange {
  const today = new Date()
  if (preset === "all") return { preset }
  const from = new Date(today)
  if (preset === "month") from.setMonth(from.getMonth() - 1)
  else from.setFullYear(from.getFullYear() - 1)
  return { preset, from: isoDate(from), to: isoDate(today) }
}
const RANGE_PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: "month", label: "Último mes" },
  { value: "year", label: "Último año" },
  { value: "all", label: "Todo" },
]

function PurchasesPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canAuthorize = can("purchases.authorize")
  const canWrite = can("purchases.write")

  const [status, setStatus] = useState<"" | ExpenseStatus>("")
  const [category, setCategory] = useState("")
  const [search, setSearch] = useState("")
  // Rango de fechas: por defecto el último mes; presets rápidos 1 mes / 1 año / todo
  const [range, setRange] = useState<DateRange>(() => presetRange("month"))

  const { simpleOptions: categoryOptions } = useCatalog("expense_category")
  const categoryLabel = (code: string) => categoryOptions.find((o) => o.value === code)?.label ?? code

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["purchases", status, category, range.from, range.to],
    queryFn: () => expensesApi.all({
      ...(status ? { status } : {}), ...(category ? { category } : {}),
      ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}),
    }),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["purchases"] })
  const onError = (err: Error) => toast.error("No se pudo completar la acción", err.message)
  const authorizeM = useMutation({
    mutationFn: expensesApi.authorize,
    onSuccess: () => { invalidate(); toast.success("Gasto autorizado") }, onError,
  })
  const revertM = useMutation({
    mutationFn: expensesApi.revert,
    onSuccess: () => { invalidate(); toast.success("Gasto regresado a pendiente") }, onError,
  })

  // ── Registro de pago (total o parcial) ──
  const [paying, setPaying] = useState<ExpenseWithShipment | null>(null)
  const [payForm, setPayForm] = useState({ amount: "", method: "transferencia" as PaymentMethod, reference: "", paidAt: "" })
  const [payErrors, setPayErrors] = useState<Record<string, string>>({})
  function openPay(e: ExpenseWithShipment) {
    const remaining = num(e.amount) - num(e.paidAmount)
    setPayForm({ amount: remaining.toFixed(2), method: "transferencia", reference: "", paidAt: new Date().toISOString().slice(0, 10) })
    setPayErrors({})
    setPaying(e)
  }
  const payM = useMutation({
    mutationFn: () => expensesApi.registerPayment(paying!.id, {
      amount: num(payForm.amount),
      method: payForm.method,
      reference: payForm.reference || null,
      paidAt: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : null,
    }),
    onSuccess: () => { invalidate(); setPaying(null); toast.success("Pago registrado") },
    onError,
  })
  // La fecha de pago no puede ser futura (un pago registrado ya ocurrió).
  function handlePay(ev: React.FormEvent) {
    ev.preventDefault()
    const errs = collectErrors({ "pay-date": validateDateField(payForm.paidAt, { notFuture: true, label: "La fecha de pago" }) })
    for (const inc of findIncompleteDateInputs(document.getElementById("pay-form") ?? document)) errs[inc.id] = inc.message
    if (Object.keys(errs).length) { setPayErrors(errs); scrollToFirstError(); return }
    setPayErrors({}); payM.mutate()
  }

  // ── Registrar gasto (orden de compra) desde Compras: ligado a un expediente o general ──
  const NEW_EXPENSE = { category: "flete", concept: "", amount: "", currency: "MXN", supplierId: "", shipmentId: "", expenseDate: "", reference: "", notes: "" }
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(NEW_EXPENSE)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersApi.list() })
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments-all"], queryFn: () => shipmentsApi.list() })
  function openNew() { setForm(NEW_EXPENSE); setFiles([]); setErrors({}); setShowNew(true) }
  const createM = useMutation({
    mutationFn: async () => {
      const saved = await expensesApi.createGlobal({
        category: form.category, concept: form.concept.trim(), amount: num(form.amount), currency: form.currency,
        supplierId: form.supplierId || null, shipmentId: form.shipmentId || null,
        expenseDate: form.expenseDate ? new Date(form.expenseDate).toISOString() : null,
        reference: form.reference || null, notes: form.notes || null,
      })
      for (const file of files) await documentsApi.upload("expense", saved.id, file, { kind: "factura", notes: form.concept.trim() })
      return saved
    },
    onSuccess: () => { invalidate(); setShowNew(false); toast.success("Gasto registrado") },
    onError,
  })
  function handleCreate(ev: React.FormEvent) {
    ev.preventDefault()
    const errs = collectErrors({
      concept: validateRequired(form.concept, "Concepto"),
      amount: validateQuantity(form.amount),
      expenseDate: validateDateField(form.expenseDate, { notFuture: true, label: "La fecha del gasto" }),
    })
    for (const inc of findIncompleteDateInputs(document.getElementById("new-expense-form") ?? document)) errs[inc.id] = inc.message
    if (Object.keys(errs).length) { setErrors(errs); toast.error("Revisa los campos marcados", "Hay datos por corregir."); scrollToFirstError(); return }
    setErrors({}); createM.mutate()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter((e) =>
      [e.concept, e.supplierName, e.shipment?.folio, e.reference].some((f) => f?.toLowerCase().includes(q)))
  }, [expenses, search])

  // Saldos: pendiente = monto − pagado (de los no saldados); vencido = saldo con vencimiento pasado
  const outstanding = (e: ExpenseWithShipment) => num(e.amount) - num(e.paidAmount)
  const totSaldo = expenses.filter((e) => e.status !== "paid").reduce((a, e) => a + outstanding(e), 0)
  const totVencido = expenses.filter((e) => e.status !== "paid" && (daysToDue(e.dueDate) ?? 99999) < 0).reduce((a, e) => a + outstanding(e), 0)
  const totPagado = expenses.reduce((a, e) => a + num(e.paidAmount), 0)
  const totGastos = expenses.reduce((a, e) => a + num(e.amount), 0)

  return (
    <AppLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ShoppingCart className="h-6 w-6 text-[var(--color-primary)]" />
          <div>
            <h1 className="text-xl font-bold">Compras y gastos</h1>
            <p className="text-sm text-[var(--color-muted-foreground)]">Registra, autoriza y paga gastos de expedientes o generales.</p>
          </div>
        </div>
        {canWrite && (
          <Button size="sm" className="flex items-center gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> Registrar gasto
          </Button>
        )}
      </div>

      {/* Resumen */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Saldo pendiente" value={money(totSaldo)} tone="amber" />
        <SummaryCard label="Vencido" value={money(totVencido)} tone={totVencido > 0 ? "red" : "default"} />
        <SummaryCard label="Pagado" value={money(totPagado)} tone="green" />
        <SummaryCard label="Total gastos" value={money(totGastos)} tone="default" />
      </div>

      {/* Filtros */}
      <Card className="mb-4 flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar concepto, proveedor, folio..."
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
          <div className="w-40"><Select value={status} onChange={(e) => setStatus(e.target.value as "" | ExpenseStatus)} options={STATUS_FILTER} /></div>
          <div className="w-48"><Select value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Todas las categorías" options={categoryOptions} /></div>
        </div>
        {/* Rango de fechas: presets rápidos + rango personalizado */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Periodo:</span>
          <div className="flex gap-1 rounded-md bg-[var(--color-muted)] p-0.5">
            {RANGE_PRESETS.map((p) => (
              <button key={p.value} type="button" onClick={() => setRange(presetRange(p.value))}
                className={`rounded px-2.5 py-1 text-xs font-medium ${range.preset === p.value ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
            <input type="date" value={range.from ?? ""} onChange={(e) => setRange((r) => ({ preset: "custom", from: e.target.value || undefined, to: r.to }))}
              className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            <span>a</span>
            <input type="date" value={range.to ?? ""} onChange={(e) => setRange((r) => ({ preset: "custom", from: r.from, to: e.target.value || undefined }))}
              className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando...</p>
      ) : filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">No hay gastos con esos filtros.</Card>
      ) : (
        <Card className="divide-y divide-[var(--color-border)]">
          {filtered.map((e) => {
            const st = EXPENSE_STATUS[e.status]
            const busy = authorizeM.isPending || payM.isPending || revertM.isPending
            const dd = e.status !== "paid" ? daysToDue(e.dueDate) : null
            const paid = num(e.paidAmount)
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to="/expenses/$id" params={{ id: e.id }} className="font-medium hover:text-[var(--color-primary)] hover:underline">{e.concept}</Link>
                    <Badge variant="outline">{categoryLabel(e.category)}</Badge>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    {!e.hasEvidence && (
                      <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Sin comprobante</Badge>
                    )}
                    {dd != null && (
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${dd < 0 ? "bg-red-100 text-red-700" : dd <= 7 ? "bg-amber-100 text-amber-700" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"}`}>
                        <CalendarClock className="h-3 w-3" />
                        {dd < 0 ? `Vencido ${-dd}d` : dd === 0 ? "Vence hoy" : `Vence en ${dd}d`}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--color-muted-foreground)]">
                    {e.supplierName && <span>{e.supplierName}</span>}
                    {e.shipment && (
                      <Link to="/shipments/$id" params={{ id: e.shipment.id }} className="font-mono text-[var(--color-primary)] hover:underline">{e.shipment.folio}</Link>
                    )}
                    {e.reference && <span>Ref: {e.reference}</span>}
                    {e.expenseDate && <span>{new Date(e.expenseDate).toLocaleDateString("es-MX")}</span>}
                    {paid > 0 && <span className="text-green-600">Pagado {money(paid, e.currency)} de {money(num(e.amount), e.currency)}</span>}
                  </div>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">{money(parseFloat(e.amount), e.currency)}</span>
                {canAuthorize && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {e.status === "pending" && (
                      <Button size="sm" variant="outline" loading={busy} disabled={!e.hasEvidence}
                        title={e.hasEvidence ? undefined : "Captura el comprobante antes de autorizar"}
                        onClick={() => authorizeM.mutate(e.id)}>
                        <Check className="mr-1 h-3.5 w-3.5" />Autorizar
                      </Button>
                    )}
                    {(e.status === "authorized" || e.status === "partial") && (
                      <Button size="sm" loading={busy} onClick={() => openPay(e)}>
                        <CircleDollarSign className="mr-1 h-3.5 w-3.5" />Registrar pago
                      </Button>
                    )}
                    {e.status !== "pending" && (
                      <Button size="sm" variant="ghost" loading={busy} title="Regresar a pendiente (borra pagos)" onClick={() => revertM.mutate(e.id)}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </Card>
      )}

      {/* Registrar gasto (orden de compra) */}
      <Drawer open={showNew} onClose={() => setShowNew(false)} title="Registrar gasto"
        description="Liga el gasto a un expediente o déjalo como gasto general."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button type="submit" form="new-expense-form" size="sm" loading={createM.isPending}>Guardar gasto</Button>
          </div>
        }>
        <form id="new-expense-form" onSubmit={handleCreate} className="flex flex-col gap-3">
          <Input id="concept" label="Concepto" value={form.concept} onChange={setF("concept")} error={errors.concept} placeholder="Ej. Flete tramo Manzanillo→GDL" />
          <div className="grid grid-cols-2 gap-3">
            <Select id="category" label="Categoría" options={categoryOptions} value={form.category} onChange={setF("category")} />
            <MoneyInput label="Monto" currency={form.currency} value={form.amount} onChange={(v) => setForm((f) => ({ ...f, amount: v }))} error={errors.amount} />
          </div>
          <Select id="supplierId" label="Proveedor (opcional)" placeholder="Sin proveedor" value={form.supplierId} onChange={setF("supplierId")}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          <Select id="shipmentId" label="Expediente (opcional)" placeholder="General (sin expediente)" value={form.shipmentId} onChange={setF("shipmentId")}
            options={shipments.map((s) => ({ value: s.id, label: `${s.folio} · ${s.customer?.name ?? ""}` }))} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="expenseDate" type="date" label="Fecha del gasto" value={form.expenseDate} onChange={setF("expenseDate")} error={errors.expenseDate} />
            <Input id="reference" label="Folio de factura (evidencia)" value={form.reference} onChange={setF("reference")} placeholder="FAC-001" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--color-foreground)]">Comprobante (opcional)</label>
            <PendingFilesPicker files={files} onChange={setFiles} disabled={createM.isPending} />
            <p className="text-xs text-[var(--color-muted-foreground)]">Puedes guardar sin comprobante; se exige (folio o documento) para autorizar el pago.</p>
          </div>
          <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={setF("notes")} />
        </form>
      </Drawer>

      {/* Registrar pago (total o parcial) */}
      {paying && (
        <Dialog open onClose={() => setPaying(null)} title={`Registrar pago — ${paying.concept}`} className="max-w-md">
          <form id="pay-form" onSubmit={handlePay} className="flex flex-col gap-4">
            <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Monto del gasto</span><span>{money(num(paying.amount), paying.currency)}</span></div>
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Pagado</span><span>{money(num(paying.paidAmount), paying.currency)}</span></div>
              <div className="mt-0.5 flex justify-between border-t border-[var(--color-border)] pt-0.5 font-medium"><span>Saldo</span><span>{money(num(paying.amount) - num(paying.paidAmount), paying.currency)}</span></div>
            </div>
            <MoneyInput label="Monto del pago" currency={paying.currency} value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select id="pay-method" label="Método" options={PAYMENT_METHODS} value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value as PaymentMethod }))} />
              <Input id="pay-date" type="date" label="Fecha de pago" value={payForm.paidAt} onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))} error={payErrors["pay-date"]} />
            </div>
            <Input id="pay-ref" label="Referencia (opcional)" placeholder="SPEI / folio / cheque" value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPaying(null)}>Cancelar</Button>
              <Button type="submit" size="sm" loading={payM.isPending}>Registrar pago</Button>
            </div>
          </form>
        </Dialog>
      )}
    </AppLayout>
  )
}

const TONE: Record<string, string> = {
  amber: "text-amber-600", blue: "text-[var(--color-primary)]", green: "text-green-600", red: "text-[var(--color-destructive)]", default: "text-[var(--color-foreground)]",
}
function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${TONE[tone]}`}>{value}</p>
    </Card>
  )
}
