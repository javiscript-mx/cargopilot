import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Package, Pencil, LayoutGrid, Route as RouteIcon, Truck, Boxes, Receipt, FileText, History } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, type TabItem } from "@/components/ui/tabs"
import { DocumentsSection } from "@/components/ui/documents-section"
import { CargoSection } from "@/components/shipments/cargo-section"
import { ReadinessBar } from "@/components/shipments/readiness-panel"
import { QuotePanel } from "@/components/shipments/quote-panel"
import { InvoicePanel } from "@/components/shipments/invoice-panel"
import { ProcessSection } from "@/components/shipments/process-section"
import { LogSection } from "@/components/shipments/log-section"
import { SummaryTab } from "@/components/shipments/summary-tab"
import { shipmentsApi, STATUS_CONFIG, type ShipmentStatus } from "@/api/shipments"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"
import { ApiError } from "@/lib/api-client"
import { useToast } from "@/components/ui/toast"

export const Route = createFileRoute("/shipments/$id/")({
  component: ShipmentDetailPage,
})

const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
}
const transitionLabels: Record<ShipmentStatus, string> = {
  confirmed: "Confirmar", in_transit: "Iniciar operación", delivered: "Marcar completado", cancelled: "Cancelar", draft: "",
}

function ShipmentDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canEdit = can("shipments.write")
  const canChangeStatus = can("shipments.changeStatus")
  const canDelete = can("shipments.delete")
  const canWriteDocuments = can("documents.write")

  const [tab, setTab] = useState("resumen")

  const { data: shipment, isLoading } = useQuery({ queryKey: ["shipments", id], queryFn: () => shipmentsApi.get(id) })
  const { data: readiness } = useQuery({ queryKey: ["readiness", id], queryFn: () => shipmentsApi.readiness(id) })
  const { items: operationTypes } = useCatalog("service_type")

  const statusMutation = useMutation({
    mutationFn: (status: ShipmentStatus) => shipmentsApi.updateStatus(id, status),
    onSuccess: (_, status) => {
      queryClient.invalidateQueries({ queryKey: ["shipments", id] })
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      queryClient.invalidateQueries({ queryKey: ["readiness", id] })
      toast.success("Estado actualizado", STATUS_CONFIG[status]?.label ?? status)
    },
    onError: (err: Error) => {
      const missing = err instanceof ApiError && err.details?.length ? err.details.join(" · ") : err.message
      toast.error("No se pudo cambiar el estado", missing)
    },
  })

  if (isLoading) {
    return <AppLayout><div className="flex items-center justify-center py-20 text-[--color-muted-foreground]">Cargando...</div></AppLayout>
  }
  if (!shipment) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-[--color-muted-foreground]">Expediente no encontrado</p>
          <Link to="/shipments"><Button variant="outline">Volver</Button></Link>
        </div>
      </AppLayout>
    )
  }

  const status = STATUS_CONFIG[shipment.status]
  const nextStatuses = transitions[shipment.status]
  const operationLabel = operationTypes.find((t) => t.code === shipment.operationType)?.name ?? shipment.operationType
  const cancelled = shipment.status === "cancelled"

  // Gate por estado destino (para deshabilitar el botón si faltan datos)
  const gateFor = (next: ShipmentStatus) => readiness?.gates[next as "confirmed" | "in_transit" | "delivered"]

  const tabs: TabItem[] = [
    { id: "resumen", label: "Resumen", icon: <LayoutGrid className="h-4 w-4" /> },
    { id: "plan", label: "Plan", icon: <RouteIcon className="h-4 w-4" /> },
    { id: "transporte", label: "Transporte", icon: <Truck className="h-4 w-4" /> },
    { id: "carga", label: "Carga", icon: <Boxes className="h-4 w-4" /> },
    { id: "fiscal", label: "Fiscal", icon: <Receipt className="h-4 w-4" /> },
    { id: "evidencias", label: "Evidencias", icon: <FileText className="h-4 w-4" /> },
    { id: "bitacora", label: "Bitácora", icon: <History className="h-4 w-4" /> },
  ]

  return (
    <AppLayout>
      {/* ── Cabecera operativa ── */}
      <div className="mb-4">
        <Link to="/shipments" className="mb-3 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Expedientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-2xl font-bold">{shipment.folio}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-sm text-[--color-muted-foreground]">{shipment.customer.name}</span>
            <span className="text-sm text-[--color-muted-foreground]">· {operationLabel}</span>
          </div>
          {(canEdit || canChangeStatus) && (
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Link to="/shipments/$id/edit" params={{ id }}>
                  <Button variant="outline" size="sm" className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" /> Editar</Button>
                </Link>
              )}
              {canChangeStatus && nextStatuses.map((next) => {
                const gate = next === "cancelled" ? undefined : gateFor(next)
                const blocked = gate ? !gate.ok : false
                const missingN = gate?.missing.length ?? 0
                return (
                  <Button key={next} variant={next === "cancelled" ? "destructive" : "default"} size="sm"
                    loading={statusMutation.isPending} disabled={blocked}
                    title={blocked ? `Faltan ${missingN} dato(s): ${gate?.missing.join(" · ")}` : undefined}
                    onClick={() => { if (next === "cancelled" && !confirm("¿Cancelar este expediente?")) return; statusMutation.mutate(next) }}>
                    {transitionLabels[next]}{blocked ? ` · faltan ${missingN}` : ""}
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Barra de control (siguiente acción + semáforos + faltantes) ── */}
      {!cancelled && <div className="mb-4"><ReadinessBar shipmentId={id} customerId={shipment.customer.id} onGoTo={setTab} /></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Columna principal: pestañas ── */}
        <div className="min-w-0 lg:col-span-2">
          <Card className="min-w-0">
            <Tabs tabs={tabs} active={tab} onChange={setTab} className="px-2 pt-1" />
            <div className="p-4">
              {tab === "resumen" && <SummaryTab shipmentId={id} onGoTo={setTab} />}
              {tab === "plan" && <ProcessSection shipmentId={id} locked={cancelled} view="flow" bare onGoToTab={setTab} />}
              {tab === "transporte" && <ProcessSection shipmentId={id} locked={cancelled} view="transport" bare onGoToTab={setTab} />}
              {tab === "carga" && <CargoSection shipmentId={id} cargoType={shipment.cargoType} canEdit={canEdit} bare />}
              {tab === "fiscal" && (
                <div className="flex flex-col gap-4">
                  {/* Tarifa editable inline (a todo el ancho de la pestaña, no en un drawer angosto) */}
                  <QuotePanel shipmentId={id} />
                  <InvoicePanel shipmentId={id} />
                </div>
              )}
              {tab === "evidencias" && <DocumentsSection entityType="shipment" entityId={id} readOnly={!canWriteDocuments} bare />}
              {tab === "bitacora" && <LogSection shipmentId={id} canEdit={canEdit} canDelete={canDelete} />}
            </div>
          </Card>
        </div>

        {/* ── Sidebar: ficha de contexto (identidad/referencia, NO estado — eso vive en
            la barra de control y en Resumen) ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="lg:sticky lg:top-4">
            <ContextSidebar customerId={shipment.customer.id} customerName={shipment.customer.name} rfc={shipment.customer.rfc}
              reference={shipment.reference} description={shipment.cargo?.description ?? null} notes={shipment.notes}
              createdAt={shipment.createdAt} />
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

// Ficha de contexto: quién/qué del expediente (identidad + referencias). El estado
// (semáforos) NO va aquí para no duplicar la barra de control ni la pestaña Resumen.
function ContextSidebar({ customerId, customerName, rfc, reference, description, notes, createdAt }: {
  customerId: string; customerName: string; rfc: string
  reference: string | null; description: string | null; notes: string | null; createdAt: string
}) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Contexto</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div>
          <p className="font-medium">{customerName}</p>
          <p className="font-mono text-xs text-[--color-muted-foreground]">{rfc}</p>
          <Link to="/customers/$id" params={{ id: customerId }} className="mt-1 inline-block text-xs text-[--color-primary] hover:underline">
            Ver cliente →
          </Link>
        </div>
        <div className="flex flex-col gap-2 border-t border-[--color-border] pt-3">
          {reference && <Row label="Referencia" value={<span className="font-mono text-xs">{reference}</span>} />}
          {description && <Row label="Servicio" value={description} />}
          <Row label="Creado" value={new Date(createdAt).toLocaleDateString("es-MX")} />
          {notes && <Row label="Notas" value={notes} />}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="shrink-0 text-[--color-muted-foreground]">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  )
}
