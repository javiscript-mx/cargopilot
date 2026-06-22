import { useQuery } from "@tanstack/react-query"
import { MapPin, Receipt, Truck, Boxes, FileText, PackageCheck, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { processApi, type LegLocation } from "@/api/process"
import { quotesApi } from "@/api/quotes"
import { merchandiseApi } from "@/api/merchandise"
import { invoicesApi } from "@/api/invoices"
import { shipmentsApi } from "@/api/shipments"

type Variant = "default" | "success" | "warning" | "destructive" | "outline"

// Vista ejecutiva: el operador entiende el estado del expediente sin entrar a cada pestaña.
export function SummaryTab({ shipmentId, onGoTo }: { shipmentId: string; onGoTo: (tab: string) => void }) {
  const { data: process } = useQuery({ queryKey: ["process", shipmentId], queryFn: () => processApi.get(shipmentId) })
  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: merch = [] } = useQuery({ queryKey: ["merchandise", shipmentId], queryFn: () => merchandiseApi.list(shipmentId) })
  const { data: invoices = [] } = useQuery({ queryKey: ["invoices", "shipment", shipmentId], queryFn: () => invoicesApi.listByShipment(shipmentId) })
  const { data: readiness } = useQuery({ queryKey: ["readiness", shipmentId], queryFn: () => shipmentsApi.readiness(shipmentId) })

  const legs = process?.legs ?? []
  const loc = (v: Record<string, unknown> | null) => (v as LegLocation | null)
  // Remitente/destinatario CON su lugar (CP + Estado) → "Remitente SA (44100 JAL)"
  const endpoint = (v: Record<string, unknown> | null): string | null => {
    const l = loc(v)
    if (!l) return null
    const name = l.name?.trim()
    const place = [l.zip, l.state].filter(Boolean).join(" ")
    if (!name && !place) return null
    return place ? `${name ?? "—"} (${place})` : (name ?? null)
  }
  const origin = endpoint(legs[0]?.origin ?? null)
  const dest = endpoint(legs[legs.length - 1]?.destination ?? null)
  const eta = legs[legs.length - 1]?.plannedDeliveryAt
  const totalUnits = legs.reduce((a, l) => a + l.vehicles.length, 0)
  const unitsWithData = legs.reduce((a, l) => a + l.vehicles.filter((v) => v.vehicleId && v.operatorId).length, 0)
  const foraneoUnits = legs.filter((l) => l.scope === "foraneo").flatMap((l) => l.vehicles)
  const cpStamped = foraneoUnits.filter((v) => v.cartaPorteInvoiceId).length

  const items = quote?.items ?? []
  const sell = items.reduce((a, i) => a + (Number(i.amount) || 0), 0)
  const cost = quote?.estimatedCost ? Number(quote.estimatedCost) : 0
  const margin = sell - cost
  const cur = quote?.currency ?? "MXN"
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: cur })

  const totalWeight = merch.reduce((a, m) => a + (m.weight ? Number(m.weight) : 0), 0)
  const serviceInv = invoices.find((i) => i.status === "stamped") ?? invoices[0]
  const block = (k: string) => readiness?.blocks.find((b) => b.key === k)

  return (
    <div className="flex flex-col gap-3">
      {/* Siguiente acción */}
      {readiness?.nextAction && !readiness.blocks.filter((b) => b.applies).every((b) => b.ok) && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50/50 p-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Siguiente acción</p>
            <p className="truncate text-sm font-semibold">{readiness.nextAction.label}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryRow icon={<MapPin className="h-4 w-4" />} title="Ruta" onGo={() => onGoTo("transporte")}
          status={block("ruta")?.ok ? ["Lista", "success"] : ["Pendiente", "outline"]}>
          {legs.length === 0 ? "Sin tramos" : <>{origin || "—"} → {dest || "—"} · {legs.length} tramo(s){eta ? ` · ETA ${new Date(eta).toLocaleDateString("es-MX")}` : ""}</>}
        </SummaryRow>

        <SummaryRow icon={<Receipt className="h-4 w-4" />} title="Tarifa" onGo={() => onGoTo("fiscal")}
          status={quote?.status === "accepted" ? ["Aceptada", "success"] : quote ? ["Pendiente", "warning"] : ["Sin cotizar", "outline"]}>
          {sell > 0 ? <>Venta {money(sell)} · Margen <span className={margin < 0 ? "text-[var(--color-destructive)]" : "text-green-600"}>{money(margin)}</span></> : "Sin cargos"}
        </SummaryRow>

        <SummaryRow icon={<Truck className="h-4 w-4" />} title="Transporte" onGo={() => onGoTo("transporte")}
          status={block("transporte")?.ok ? ["Asignado", "success"] : ["Pendiente", "outline"]}>
          {totalUnits === 0 ? "Sin unidades" : `${unitsWithData}/${totalUnits} unidad(es) con vehículo y operador`}
        </SummaryRow>

        <SummaryRow icon={<Boxes className="h-4 w-4" />} title="Carga" onGo={() => onGoTo("carga")}
          status={merch.length > 0 ? ["Capturada", "success"] : ["Pendiente", "outline"]}>
          {merch.length === 0 ? "Sin mercancía" : `${merch.length} partida(s)${totalWeight > 0 ? ` · ${totalWeight.toLocaleString("es-MX")} kg` : ""}`}
        </SummaryRow>

        <SummaryRow icon={<FileText className="h-4 w-4" />} title="Fiscal" onGo={() => onGoTo("fiscal")}
          status={serviceInv?.status === "stamped" ? ["Timbrada", "success"] : serviceInv ? ["Borrador", "warning"] : ["Pendiente", "outline"]}>
          {serviceInv ? <>Factura {serviceInv.series}-{serviceInv.folio}</> : "Sin factura"}
          {readiness?.hasForaneo && ` · Carta Porte ${cpStamped}/${foraneoUnits.length}`}
        </SummaryRow>

        <SummaryRow icon={<PackageCheck className="h-4 w-4" />} title="POD" onGo={() => onGoTo("evidencias")}
          status={block("cierre")?.ok ? ["Completo", "success"] : ["Pendiente", "outline"]}>
          {block("cierre")?.ok ? "Entrega confirmada y evidencia cargada" : "Falta confirmar entrega o evidencia"}
        </SummaryRow>
      </div>
    </div>
  )
}

function SummaryRow({ icon, title, status, children, onGo }: {
  icon: React.ReactNode; title: string; status: [string, Variant]; children: React.ReactNode; onGo: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[var(--color-border)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <span className="text-[var(--color-muted-foreground)]">{icon}</span> {title}
        </span>
        <div className="flex items-center gap-1.5">
          <Badge variant={status[1]}>{status[0]}</Badge>
          <button onClick={onGo} title={`Ir a ${title}`} className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]">
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--color-muted-foreground)]">{children}</p>
    </div>
  )
}
