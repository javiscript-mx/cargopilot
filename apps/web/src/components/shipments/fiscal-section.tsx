import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Receipt, FileText, Wallet } from "lucide-react"
import { QuotePanel } from "@/components/shipments/quote-panel"
import { InvoicePanel } from "@/components/shipments/invoice-panel"
import { ExpensesPanel } from "@/components/shipments/expenses-panel"
import { quotesApi } from "@/api/quotes"
import { invoicesApi } from "@/api/invoices"
import { expensesApi } from "@/api/expenses"

// Control financiero del expediente: un resumen siempre visible + sub-navegación entre
// los 3 procesos (Cotización / Facturación / Gastos), para no apilar todo en una columna larga.
export function FiscalSection({ shipmentId }: { shipmentId: string }) {
  const [sub, setSub] = useState<"cotizacion" | "facturacion" | "gastos">("cotizacion")

  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", "shipment", shipmentId], queryFn: () => invoicesApi.listByShipment(shipmentId) })
  const { data: expenses = [] } = useQuery({ queryKey: ["expenses", shipmentId], queryFn: () => expensesApi.list(shipmentId) })

  const cur = quote?.currency ?? "MXN"
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: cur })

  const cotizado = (quote?.items ?? []).reduce((a, i) => a + Number(i.amount), 0)
  const facturado = invoices.filter((i) => i.status === "stamped").reduce((a, i) => a + parseFloat(i.subtotal), 0)
  const gasto = expenses.reduce((a, e) => a + parseFloat(e.amount), 0)
  const utilidadReal = cotizado - gasto
  const pendienteFacturar = cotizado - facturado

  const subs = [
    { id: "cotizacion" as const, label: "Cotización", icon: <Receipt className="h-4 w-4" />, hint: pendienteFacturar > 0.01 || cotizado === 0 },
    { id: "facturacion" as const, label: "Facturación", icon: <FileText className="h-4 w-4" /> },
    { id: "gastos" as const, label: "Gastos", icon: <Wallet className="h-4 w-4" /> },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Resumen financiero: lo importante de un vistazo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Cotizado" value={money(cotizado)} />
        <Stat label="Facturado" value={money(facturado)} sub={pendienteFacturar > 0.01 ? `Pendiente ${money(pendienteFacturar)}` : "Completo"} subTone={pendienteFacturar > 0.01 ? "amber" : "green"} />
        <Stat label="Gastos" value={money(gasto)} />
        <Stat label="Utilidad real" value={money(utilidadReal)} highlight tone={utilidadReal < 0 ? "red" : "green"} />
      </div>

      {/* Sub-navegación entre procesos */}
      <div className="flex gap-1 rounded-lg bg-[var(--color-muted)] p-1">
        {subs.map((s) => {
          const active = sub === s.id
          return (
            <button key={s.id} type="button" onClick={() => setSub(s.id)}
              className={[
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              ].join(" ")}>
              {s.icon}<span className="hidden sm:inline">{s.label}</span>
              {s.hint && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          )
        })}
      </div>

      {sub === "cotizacion" && <QuotePanel shipmentId={shipmentId} />}
      {sub === "facturacion" && <InvoicePanel shipmentId={shipmentId} />}
      {sub === "gastos" && <ExpensesPanel shipmentId={shipmentId} />}
    </div>
  )
}

function Stat({ label, value, sub, subTone, highlight, tone }: {
  label: string; value: string; sub?: string; subTone?: "amber" | "green"; highlight?: boolean; tone?: "red" | "green"
}) {
  const valueCls = highlight ? (tone === "red" ? "text-[var(--color-destructive)]" : "text-green-600") : "text-[var(--color-foreground)]"
  return (
    <div className={`rounded-md border p-2.5 ${highlight ? "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5" : "border-[var(--color-border)]"}`}>
      <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
      <p className={`text-base font-bold tabular-nums ${valueCls}`}>{value}</p>
      {sub && <p className={`text-[10px] font-medium ${subTone === "amber" ? "text-amber-600" : "text-green-600"}`}>{sub}</p>}
    </div>
  )
}
