import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Package, Building2, FileText, TrendingUp, ArrowRight, CircleDashed } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { shipmentsApi, STATUS_CONFIG, type Shipment } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { invoicesApi } from "@/api/invoices"
import { useCatalog } from "@/hooks/use-catalog"

export const Route = createFileRoute("/")({
  component: DashboardPage,
})

function StatCard({ title, value, icon: Icon, description }: {
  title: string
  value: number | string
  icon: React.ElementType
  description?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-[var(--color-muted-foreground)]">{title}</CardTitle>
          <Icon className="h-4 w-4 text-[var(--color-muted-foreground)]" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {description && <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{description}</p>}
      </CardContent>
    </Card>
  )
}

/** Ruta para fletes, referencia para servicios, — si no hay nada */
function operationContext(s: Shipment): React.ReactNode {
  if (s.origin && s.destination) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="max-w-[120px] truncate">{s.origin}</span>
        <ArrowRight className="h-3 w-3 shrink-0" />
        <span className="max-w-[120px] truncate">{s.destination}</span>
      </span>
    )
  }
  if (s.reference) return <span className="font-mono text-xs">{s.reference}</span>
  if (s.cargo?.description) return <span className="max-w-[240px] truncate">{s.cargo.description}</span>
  return "—"
}

function DashboardPage() {
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments"], queryFn: shipmentsApi.list })
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: invoicesApi.list })
  const { items: operationTypes } = useCatalog("service_type")

  const opLabel = (code: string) => operationTypes.find((t) => t.code === code)?.name ?? code

  // ── Filtro por mes(es) — default: mes actual. Permite uno o varios meses. ──
  const monthOptions = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      return {
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" }),
      }
    })
  }, [])
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set([monthOptions[0]!.value]))
  const toggleMonth = (v: string) =>
    setSelectedMonths((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  // Sin selección = todos los meses
  const inPeriod = (iso: string) => selectedMonths.size === 0 || selectedMonths.has(iso.slice(0, 7))

  const periodShipments = shipments.filter((s) => inPeriod(s.createdAt))
  const periodInvoices = invoices.filter((i) => inPeriod(i.createdAt))

  const activeShipments = periodShipments.filter((s) => !["delivered", "cancelled"].includes(s.status))
  const inProgress = periodShipments.filter((s) => s.status === "in_transit")
  const drafts = periodShipments.filter((s) => s.status === "draft")
  const stampedInvoices = periodInvoices.filter((i) => i.status === "stamped")
  const totalBilled = stampedInvoices.reduce((acc, i) => acc + parseFloat(i.total), 0)
  const recentShipments = [...periodShipments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

  // Mix de operaciones activas por tipo — impo, expo, servicios, todo cuenta igual
  const byType = activeShipments.reduce<Record<string, number>>((acc, s) => {
    acc[s.operationType] = (acc[s.operationType] ?? 0) + 1
    return acc
  }, {})
  const typeBreakdown = Object.entries(byType)
    .map(([code, count]) => ({ code, label: opLabel(code), count }))
    .sort((a, b) => b.count - a.count)
  const maxTypeCount = Math.max(1, ...typeBreakdown.map((t) => t.count))

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-[var(--color-muted-foreground)]">Resumen de operaciones</p>
        </div>
        {/* Filtro de meses: default mes actual; toca para sumar/quitar meses */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-[var(--color-muted-foreground)]">Periodo:</span>
          {monthOptions.map((m) => {
            const on = selectedMonths.has(m.value)
            return (
              <button key={m.value} type="button" onClick={() => toggleMonth(m.value)}
                className={on
                  ? "rounded-full bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium capitalize text-white"
                  : "rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium capitalize text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"}>
                {m.label}
              </button>
            )
          })}
          {selectedMonths.size > 0 && (
            <button type="button" onClick={() => setSelectedMonths(new Set())} className="ml-1 text-xs text-[var(--color-primary)] hover:underline">
              Todos
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Operaciones activas"
          value={activeShipments.length}
          icon={Package}
          description={`${inProgress.length} en proceso · ${drafts.length} en borrador`}
        />
        <StatCard
          title="Clientes"
          value={customers.length}
          icon={Building2}
        />
        <StatCard
          title="Facturas timbradas"
          value={stampedInvoices.length}
          icon={FileText}
          description={`${invoices.length} en total`}
        />
        <StatCard
          title="Total facturado"
          value={`$${totalBilled.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          description="Facturas timbradas"
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {/* ── Operaciones recientes ── */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Operaciones recientes</CardTitle>
              <Link to="/shipments" className="text-sm text-[var(--color-primary)] hover:underline">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-foreground)]">Folio</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-foreground)]">Operación</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium text-[var(--color-muted-foreground)] md:table-cell">Cliente</th>
                  <th className="hidden px-4 py-2.5 text-left font-medium text-[var(--color-muted-foreground)] xl:table-cell">Ruta / Referencia</th>
                  <th className="px-4 py-2.5 text-left font-medium text-[var(--color-muted-foreground)]">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentShipments.slice(0, 8).map((s) => {
                  const status = STATUS_CONFIG[s.status] ?? { label: s.status, variant: "outline" as const }
                  return (
                    <tr key={s.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/40">
                      <td className="px-4 py-2.5">
                        <Link to="/shipments/$id" params={{ id: s.id }} className="font-mono font-medium text-[var(--color-primary)] hover:underline">
                          {s.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">{opLabel(s.operationType)}</td>
                      <td className="hidden px-4 py-2.5 md:table-cell">{s.customer.name}</td>
                      <td className="hidden px-4 py-2.5 text-[var(--color-muted-foreground)] xl:table-cell">
                        {operationContext(s)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </td>
                    </tr>
                  )
                })}
                {recentShipments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted-foreground)]">
                      No hay operaciones en el periodo seleccionado
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ── Mix de operaciones activas ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Operaciones activas por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            {typeBreakdown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-[var(--color-muted-foreground)]">
                <CircleDashed className="h-8 w-8 opacity-30" />
                <p className="text-sm">Sin operaciones activas</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {typeBreakdown.map(({ code, label, count }) => (
                  <div key={code}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span>{label}</span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-primary)]"
                        style={{ width: `${(count / maxTypeCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
