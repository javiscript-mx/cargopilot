import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import { useCatalog } from "@/hooks/use-catalog"
import { expensesApi, EXPENSE_STATUS } from "@/api/expenses"

// Cuentas por pagar al proveedor: los gastos de expedientes asignados a este proveedor.
export function PayablesSection({ supplierId }: { supplierId: string }) {
  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", "supplier", supplierId],
    queryFn: () => expensesApi.bySupplier(supplierId),
  })
  const { simpleOptions: categoryOptions } = useCatalog("expense_category")
  const categoryLabel = (code: string) => categoryOptions.find((o) => o.value === code)?.label ?? code
  const money = (n: number, c = "MXN") => n.toLocaleString("es-MX", { style: "currency", currency: c })

  const num = (s?: string | null) => parseFloat(s ?? "0") || 0
  const porPagar = expenses.reduce((a, e) => a + (num(e.amount) - num(e.paidAmount)), 0)
  const pagado = expenses.reduce((a, e) => a + num(e.paidAmount), 0)

  if (isLoading) return <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Cargando...</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-[var(--color-border)] p-2.5">
          <p className="text-xs text-[var(--color-muted-foreground)]">Por pagar</p>
          <p className="text-base font-bold tabular-nums text-amber-600">{money(porPagar)}</p>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-2.5">
          <p className="text-xs text-[var(--color-muted-foreground)]">Pagado</p>
          <p className="text-base font-bold tabular-nums text-green-600">{money(pagado)}</p>
        </div>
        <div className="rounded-md border border-[var(--color-border)] p-2.5">
          <p className="text-xs text-[var(--color-muted-foreground)]">Total ({expenses.length})</p>
          <p className="text-base font-bold tabular-nums">{money(porPagar + pagado)}</p>
        </div>
      </div>

      {expenses.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin gastos asignados a este proveedor.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--color-border)]">
          {expenses.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/expenses/$id" params={{ id: e.id }} className="font-medium hover:text-[var(--color-primary)] hover:underline">{e.concept}</Link>
                  <Badge variant="outline">{categoryLabel(e.category)}</Badge>
                  <Badge variant={EXPENSE_STATUS[e.status].variant}>{EXPENSE_STATUS[e.status].label}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--color-muted-foreground)]">
                  {e.shipment && (
                    <Link to="/shipments/$id" params={{ id: e.shipment.id }} className="font-mono text-[var(--color-primary)] hover:underline">{e.shipment.folio}</Link>
                  )}
                  {e.reference && <span>Ref: {e.reference}</span>}
                  {e.expenseDate && <span>{new Date(e.expenseDate).toLocaleDateString("es-MX")}</span>}
                  {e.dueDate && e.status !== "paid" && <span>Vence {new Date(e.dueDate).toLocaleDateString("es-MX")}</span>}
                  {num(e.paidAmount) > 0 && <span className="text-green-600">Pagado {money(num(e.paidAmount), e.currency)}</span>}
                </div>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{money(parseFloat(e.amount), e.currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
