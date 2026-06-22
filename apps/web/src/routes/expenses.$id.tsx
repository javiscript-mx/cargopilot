import { createFileRoute, redirect, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Check, CircleDollarSign, Undo2, Trash2, Package, Wallet, AlertTriangle, Building2 } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Dialog } from "@/components/ui/dialog"
import { DocumentsSection } from "@/components/ui/documents-section"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { useCan } from "@/lib/permissions"
import { useCatalog } from "@/hooks/use-catalog"
import { authClient } from "@/lib/auth-client"
import { roleHasPermission } from "@hm/shared"
import { expensesApi, EXPENSE_STATUS, PAYMENT_METHODS, type PaymentMethod } from "@/api/expenses"

export const Route = createFileRoute("/expenses/$id")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role ?? ""
    if (!roleHasPermission(role, "purchases.read")) throw redirect({ to: "/" })
  },
  component: ExpenseDetailPage,
})

const num = (s?: string | null) => parseFloat(s ?? "0") || 0
const money = (n: number, c = "MXN") => n.toLocaleString("es-MX", { style: "currency", currency: c })
const SHIPMENT_STATUS: Record<string, string> = { draft: "Borrador", confirmed: "Confirmado", in_transit: "En tránsito", delivered: "Entregado", cancelled: "Cancelado" }

function ExpenseDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canAuthorize = can("purchases.authorize")
  const canWrite = can("purchases.write")
  const { simpleOptions: categoryOptions } = useCatalog("expense_category")
  const categoryLabel = (code: string) => categoryOptions.find((o) => o.value === code)?.label ?? code

  const { data: e, isLoading } = useQuery({ queryKey: ["expense", id], queryFn: () => expensesApi.get(id) })
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["expense", id] }); queryClient.invalidateQueries({ queryKey: ["purchases"] }) }
  const onError = (err: Error) => toast.error("No se pudo completar la acción", err.message)

  const authorizeM = useMutation({ mutationFn: () => expensesApi.authorize(id), onSuccess: () => { invalidate(); toast.success("Gasto autorizado") }, onError })
  const revertM = useMutation({ mutationFn: () => expensesApi.revert(id), onSuccess: () => { invalidate(); toast.success("Gasto regresado a pendiente") }, onError })
  const deletePaymentM = useMutation({ mutationFn: (pid: string) => expensesApi.deletePayment(id, pid), onSuccess: () => { invalidate(); toast.success("Pago eliminado") }, onError })
  const deleteM = useMutation({ mutationFn: () => expensesApi.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["purchases"] }); toast.success("Gasto eliminado"); navigate({ to: "/purchases" }) }, onError })

  const [paying, setPaying] = useState(false)
  const [payForm, setPayForm] = useState({ amount: "", method: "transferencia" as PaymentMethod, reference: "", paidAt: "" })
  const payM = useMutation({
    mutationFn: () => expensesApi.registerPayment(id, { amount: num(payForm.amount), method: payForm.method, reference: payForm.reference || null, paidAt: payForm.paidAt ? new Date(payForm.paidAt).toISOString() : null }),
    onSuccess: () => { invalidate(); setPaying(false); toast.success("Pago registrado") }, onError,
  })

  if (isLoading || !e) {
    return <AppLayout><div className="flex h-40 items-center justify-center text-[var(--color-muted-foreground)]">Cargando gasto...</div></AppLayout>
  }

  const st = EXPENSE_STATUS[e.status]
  const paid = num(e.paidAmount)
  const remaining = num(e.amount) - paid
  function openPay() { setPayForm({ amount: remaining.toFixed(2), method: "transferencia", reference: "", paidAt: new Date().toISOString().slice(0, 10) }); setPaying(true) }

  return (
    <AppLayout>
      <Link to="/purchases" className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
        <ArrowLeft className="h-4 w-4" /> Compras
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{e.concept}</h1>
            <Badge variant={st.variant}>{st.label}</Badge>
            {!e.hasEvidence && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Sin comprobante</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{categoryLabel(e.category)} · {money(num(e.amount), e.currency)}</p>
        </div>
        {canAuthorize && (
          <div className="flex flex-wrap items-center gap-1.5">
            {e.status === "pending" && (
              <Button size="sm" variant="outline" loading={authorizeM.isPending} disabled={!e.hasEvidence}
                title={e.hasEvidence ? undefined : "Captura el comprobante antes de autorizar"} onClick={() => authorizeM.mutate()}>
                <Check className="mr-1 h-3.5 w-3.5" />Autorizar
              </Button>
            )}
            {(e.status === "authorized" || e.status === "partial") && (
              <Button size="sm" loading={payM.isPending} onClick={openPay}><CircleDollarSign className="mr-1 h-3.5 w-3.5" />Registrar pago</Button>
            )}
            {e.status !== "pending" && (
              <Button size="sm" variant="ghost" loading={revertM.isPending} title="Regresar a pendiente (borra pagos)" onClick={() => revertM.mutate()}><Undo2 className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {/* Datos del gasto */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Datos del gasto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
              <Row label="Categoría" value={categoryLabel(e.category)} />
              <Row label="Monto" value={money(num(e.amount), e.currency)} />
              <Row label="Proveedor" value={e.supplierName ?? "—"} />
              <Row label="Fecha del gasto" value={e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("es-MX") : "—"} />
              <Row label="Vencimiento" value={e.dueDate ? new Date(e.dueDate).toLocaleDateString("es-MX") : (e.creditTermsDays == null ? "Sin días de crédito" : "—")} />
              <Row label="Folio / referencia" value={e.reference ?? "—"} />
              {e.notes && <div className="sm:col-span-2"><Row label="Notas" value={e.notes} /></div>}
            </CardContent>
          </Card>

          {/* Pagos */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-[var(--color-muted-foreground)]" />Pagos</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
                <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Pagado</span><span className="text-green-600">{money(paid, e.currency)}</span></div>
                <div className="mt-0.5 flex justify-between border-t border-[var(--color-border)] pt-0.5 font-medium"><span>Saldo</span><span className={remaining > 0.01 ? "text-amber-600" : "text-green-600"}>{money(remaining, e.currency)}</span></div>
              </div>
              {(e.payments?.length ?? 0) === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Sin pagos registrados.</p>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--color-border)]">
                  {e.payments!.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{money(num(p.amount), e.currency)}</span>
                        <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">{PAYMENT_METHODS.find((m) => m.value === p.method)?.label ?? p.method}{p.reference ? ` · ${p.reference}` : ""} · {new Date(p.paidAt).toLocaleDateString("es-MX")}</span>
                      </div>
                      {canAuthorize && (
                        <button title="Eliminar pago" onClick={async () => { if (await confirm(`¿Eliminar este pago de ${money(num(p.amount), e.currency)}?`)) deletePaymentM.mutate(p.id) }}
                          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)]"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Evidencia */}
          <DocumentsSection entityType="expense" entityId={id} readOnly={!canWrite} />
        </div>

        {/* Lateral: expediente ligado */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Package className="h-4 w-4 text-[var(--color-muted-foreground)]" />Expediente</CardTitle></CardHeader>
            <CardContent>
              {e.shipment ? (
                <div className="flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link to="/shipments/$id" params={{ id: e.shipment.id }} className="font-mono font-semibold text-[var(--color-primary)] hover:underline">{e.shipment.folio}</Link>
                    <Badge variant="outline">{SHIPMENT_STATUS[e.shipment.status] ?? e.shipment.status}</Badge>
                  </div>
                  {e.shipment.customer && <Row label="Cliente" value={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />{e.shipment.customer.name}</span>} />}
                  {(e.shipment.origin || e.shipment.destination) && <Row label="Ruta" value={`${e.shipment.origin ?? "—"} → ${e.shipment.destination ?? "—"}`} />}
                  <Link to="/shipments/$id" params={{ id: e.shipment.id }} className="mt-1 text-xs font-medium text-[var(--color-primary)] hover:underline">Ver expediente →</Link>
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">Gasto general (sin expediente).</p>
              )}
            </CardContent>
          </Card>

          {canWrite && (
            <Button variant="outline" size="sm" className="flex items-center gap-1.5 text-[var(--color-destructive)] hover:bg-red-50"
              onClick={async () => { if (await confirm({ title: "Eliminar gasto", description: `¿Eliminar "${e.concept}"? Se borrarán sus pagos.`, destructive: true, confirmLabel: "Eliminar" })) deleteM.mutate() }}>
              <Trash2 className="h-4 w-4" /> Eliminar gasto
            </Button>
          )}
        </div>
      </div>

      {/* Modal de pago */}
      {paying && (
        <Dialog open onClose={() => setPaying(false)} title={`Registrar pago — ${e.concept}`} className="max-w-md">
          <form onSubmit={(ev) => { ev.preventDefault(); payM.mutate() }} className="flex flex-col gap-4">
            <div className="rounded-md bg-[var(--color-muted)] p-3 text-sm">
              <div className="flex justify-between text-[var(--color-muted-foreground)]"><span>Pagado</span><span>{money(paid, e.currency)}</span></div>
              <div className="mt-0.5 flex justify-between border-t border-[var(--color-border)] pt-0.5 font-medium"><span>Saldo</span><span>{money(remaining, e.currency)}</span></div>
            </div>
            <MoneyInput label="Monto del pago" currency={e.currency} value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select id="pay-method" label="Método" options={PAYMENT_METHODS} value={payForm.method} onChange={(ev) => setPayForm((f) => ({ ...f, method: ev.target.value as PaymentMethod }))} />
              <Input id="pay-date" type="date" label="Fecha de pago" value={payForm.paidAt} onChange={(ev) => setPayForm((f) => ({ ...f, paidAt: ev.target.value }))} />
            </div>
            <Input id="pay-ref" label="Referencia (opcional)" placeholder="SPEI / folio / cheque" value={payForm.reference} onChange={(ev) => setPayForm((f) => ({ ...f, reference: ev.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setPaying(false)}>Cancelar</Button>
              <Button type="submit" size="sm" loading={payM.isPending}>Registrar pago</Button>
            </div>
          </form>
        </Dialog>
      )}
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-[var(--color-muted-foreground)]">{label}</span>
      <span className="font-medium text-[var(--color-foreground)]">{value}</span>
    </div>
  )
}
