import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Package, Pencil, Plus, Trash2, Flag, MessageSquare, ArrowRightLeft, FileText, ClipboardCheck, CircleCheck } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { DocumentsSection } from "@/components/ui/documents-section"
import { CargoSection } from "@/components/shipments/cargo-section"
import { ProcessSection } from "@/components/shipments/process-section"
import { shipmentsApi, STATUS_CONFIG, type ShipmentStatus, type ShipmentEvent } from "@/api/shipments"
import { merchandiseApi } from "@/api/merchandise"
import { useCatalog } from "@/hooks/use-catalog"
import { useSession } from "@/lib/auth-client"
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
  confirmed: "Confirmar",
  in_transit: "Iniciar operación",
  delivered: "Marcar completado",
  cancelled: "Cancelar",
  draft: "",
}

const EVENT_ICONS: Record<ShipmentEvent["type"], typeof Flag> = {
  status_change: ArrowRightLeft,
  milestone: Flag,
  note: MessageSquare,
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function ShipmentDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canEdit = role === "admin" || role === "operator"

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["shipments", id],
    queryFn: () => shipmentsApi.get(id),
  })
  // Para la guía de "información pendiente" (dedupe con CargoSection)
  const { data: merchandise = [] } = useQuery({
    queryKey: ["merchandise", id],
    queryFn: () => merchandiseApi.list(id),
  })
  const { items: operationTypes } = useCatalog("service_type")
  const { items: transportModes } = useCatalog("transport_mode")
  const { simpleOptions: milestoneOptions } = useCatalog("milestone")

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments", id] })
    queryClient.invalidateQueries({ queryKey: ["shipments"] })
  }

  const statusMutation = useMutation({
    mutationFn: (status: ShipmentStatus) => shipmentsApi.updateStatus(id, status),
    onSuccess: (_, status) => {
      invalidate()
      toast.success("Estado actualizado", STATUS_CONFIG[status]?.label ?? status)
    },
    onError: (err: Error) => toast.error("No se pudo cambiar el estado", err.message),
  })

  // ── Formulario de evento ──
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({
    kind: "milestone" as "milestone" | "note",
    milestone: "",
    title: "",
    detail: "",
    occurredAt: "",
  })
  const [eventError, setEventError] = useState("")

  const eventMutation = useMutation({
    mutationFn: () => {
      const title = eventForm.kind === "milestone"
        ? milestoneOptions.find((m) => m.value === eventForm.milestone)?.label ?? eventForm.milestone
        : eventForm.title
      return shipmentsApi.addEvent(id, {
        type: eventForm.kind,
        title,
        ...(eventForm.detail ? { detail: eventForm.detail } : {}),
        ...(eventForm.occurredAt ? { occurredAt: new Date(eventForm.occurredAt).toISOString() } : {}),
      })
    },
    onSuccess: () => {
      invalidate()
      setEventForm({ kind: "milestone", milestone: "", title: "", detail: "", occurredAt: "" })
      setShowEventForm(false)
      setEventError("")
      toast.success("Evento agregado a la bitácora")
    },
    onError: (err: Error) => setEventError(err.message),
  })

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => shipmentsApi.deleteEvent(id, eventId),
    onSuccess: () => {
      invalidate()
      toast.success("Evento eliminado")
    },
    onError: (err: Error) => toast.error("No se pudo eliminar el evento", err.message),
  })

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    if (eventForm.kind === "milestone" && !eventForm.milestone) {
      setEventError("Selecciona un hito")
      return
    }
    if (eventForm.kind === "note" && eventForm.title.trim().length < 2) {
      setEventError("Escribe un título para la nota")
      return
    }
    eventMutation.mutate()
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-[--color-muted-foreground]">Cargando...</div>
      </AppLayout>
    )
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
  const transportLabel = shipment.transportMode
    ? transportModes.find((t) => t.code === shipment.transportMode)?.name ?? shipment.transportMode
    : null
  const events = shipment.events ?? []

  // ── Información pendiente (consciente del tipo de operación) ──
  // Solo aplica mientras el expediente está activo; lo que falta depende de si
  // mueve carga (modo de transporte) o es un servicio puntual.
  const isActive = !["delivered", "cancelled"].includes(shipment.status)
  const movesCargo = Boolean(shipment.transportMode)
  const pending: string[] = []
  if (movesCargo && (!shipment.origin || !shipment.destination)) pending.push("Ruta (origen y destino)")
  if (movesCargo && merchandise.length === 0) pending.push("Mercancías de la carga")
  if (!shipment.reference) pending.push("Referencia documental (booking, BL, contenedor)")

  return (
    <AppLayout>
      {/* ── Encabezado ── */}
      <div className="mb-6">
        <Link to="/shipments" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Expedientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">{shipment.folio}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-sm text-[--color-muted-foreground]">{operationLabel}</span>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Link to="/shipments/$id/edit" params={{ id }}>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </Link>
              {nextStatuses.map((next) => (
                <Button
                  key={next}
                  variant={next === "cancelled" ? "destructive" : "default"}
                  size="sm"
                  loading={statusMutation.isPending}
                  onClick={() => {
                    if (next === "cancelled" && !confirm("¿Cancelar este expediente?")) return
                    statusMutation.mutate(next)
                  }}
                >
                  {transitionLabels[next]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Columna principal: proceso + bitácora ── */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ProcessSection shipmentId={id} canEdit={canEdit} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Bitácora</CardTitle>
              {canEdit && (
                <Button
                  size="sm" variant="outline"
                  className="flex items-center gap-1.5"
                  onClick={() => setShowEventForm((v) => !v)}
                >
                  <Plus className="h-3.5 w-3.5" /> Registrar evento
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {/* Formulario de evento */}
              {showEventForm && (
                <form onSubmit={handleAddEvent} className="mb-5 flex flex-col gap-3 rounded-md border border-[--color-border] bg-[--color-muted]/40 p-4">
                  <div className="flex gap-2">
                    {(["milestone", "note"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => setEventForm((f) => ({ ...f, kind }))}
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          eventForm.kind === kind
                            ? "bg-[--color-primary] text-white"
                            : "bg-[--color-muted] text-[--color-muted-foreground]",
                        ].join(" ")}
                      >
                        {kind === "milestone" ? "Hito" : "Nota libre"}
                      </button>
                    ))}
                  </div>

                  {eventForm.kind === "milestone" ? (
                    <Select
                      id="milestone" label="Hito"
                      placeholder="Selecciona un hito..."
                      options={milestoneOptions}
                      value={eventForm.milestone}
                      onChange={(e) => setEventForm((f) => ({ ...f, milestone: e.target.value }))}
                    />
                  ) : (
                    <Input
                      id="eventTitle" label="Título"
                      placeholder="Qué sucedió..."
                      value={eventForm.title}
                      onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  )}

                  <Input
                    id="eventDetail" label="Detalle (opcional)"
                    placeholder="Información adicional, números de referencia..."
                    value={eventForm.detail}
                    onChange={(e) => setEventForm((f) => ({ ...f, detail: e.target.value }))}
                  />
                  <Input
                    id="eventDate" label="Fecha y hora del suceso (vacío = ahora)"
                    type="datetime-local"
                    value={eventForm.occurredAt}
                    onChange={(e) => setEventForm((f) => ({ ...f, occurredAt: e.target.value }))}
                  />
                  {eventError && <p className="text-xs text-[--color-destructive]">{eventError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" loading={eventMutation.isPending}>Registrar</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setShowEventForm(false); setEventError("") }}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}

              {/* Línea de tiempo */}
              {events.length === 0 ? (
                <p className="py-6 text-center text-sm text-[--color-muted-foreground]">Sin eventos registrados.</p>
              ) : (
                <div className="relative flex flex-col">
                  {events.map((event, idx) => {
                    const Icon = EVENT_ICONS[event.type] ?? MessageSquare
                    const isLast = idx === events.length - 1
                    return (
                      <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                        {/* Línea vertical */}
                        {!isLast && (
                          <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[--color-border]" />
                        )}
                        {/* Ícono */}
                        <div className={[
                          "z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                          event.type === "status_change"
                            ? "border-[--color-primary] bg-[--color-primary]/10 text-[--color-primary]"
                            : event.type === "milestone"
                              ? "border-[--color-accent] bg-[--color-accent]/10 text-[--color-accent]"
                              : "border-[--color-border] bg-[--color-muted] text-[--color-muted-foreground]",
                        ].join(" ")}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        {/* Contenido */}
                        <div className="min-w-0 flex-1 pt-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{event.title}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="whitespace-nowrap text-xs text-[--color-muted-foreground]">
                                {formatDateTime(event.occurredAt)}
                              </span>
                              {role === "admin" && event.type !== "status_change" && (
                                <button
                                  title="Eliminar evento"
                                  onClick={() => {
                                    if (confirm("¿Eliminar este evento de la bitácora?")) deleteEventMutation.mutate(event.id)
                                  }}
                                  className="rounded p-0.5 text-[--color-muted-foreground] hover:text-[--color-destructive]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          {event.detail && (
                            <p className="mt-0.5 text-sm text-[--color-muted-foreground]">{event.detail}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <CargoSection shipmentId={id} cargoType={shipment.cargoType} canEdit={canEdit} />

          <DocumentsSection entityType="shipment" entityId={id} readOnly={!canEdit} />
        </div>

        {/* ── Columna lateral: detalles ── */}
        <div className="flex flex-col gap-4">
          {/* Información pendiente — guía al operador sobre qué falta capturar */}
          {isActive && (
            pending.length > 0 ? (
              <Card className="border-amber-300 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-800">
                    <ClipboardCheck className="h-4 w-4" /> Información pendiente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col gap-1.5 text-sm text-amber-900">
                    {pending.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  {canEdit && (
                    <Link to="/shipments/$id/edit" params={{ id }}>
                      <Button variant="outline" size="sm" className="mt-3 flex items-center gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> Completar datos
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="border-green-300 bg-green-50/50">
                <CardContent className="flex items-center gap-2 py-3 text-sm font-medium text-green-800">
                  <CircleCheck className="h-4 w-4" /> Datos completos
                </CardContent>
              </Card>
            )
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Operación</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="Tipo" value={operationLabel} />
              {transportLabel && <Row label="Transporte" value={transportLabel} />}
              {shipment.origin && <Row label="Origen" value={shipment.origin} />}
              {shipment.destination && <Row label="Destino" value={shipment.destination} />}
              {shipment.reference && <Row label="Referencia" value={<span className="font-mono text-xs">{shipment.reference}</span>} />}
              {shipment.cargo?.description && <Row label="Servicio" value={shipment.cargo.description} />}
              {shipment.notes && <Row label="Notas" value={shipment.notes} />}
              <Row label="Creado" value={new Date(shipment.createdAt).toLocaleDateString("es-MX")} />
            </CardContent>
          </Card>

          {(shipment.vehicle || shipment.operator) && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Autotransporte</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2.5 text-sm">
                {shipment.vehicle && (
                  <>
                    <Row label="Unidad" value={<span className="font-mono">{shipment.vehicle.plates}{shipment.vehicle.economicNumber ? ` · ${shipment.vehicle.economicNumber}` : ""}</span>} />
                    <Row label="Transportista" value={shipment.vehicle.supplier.name} />
                  </>
                )}
                {shipment.operator && (
                  <Row label="Operador" value={shipment.operator.name} />
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="Nombre" value={shipment.customer.name} />
              <Row label="RFC" value={<span className="font-mono text-xs">{shipment.customer.rfc}</span>} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Facturas</CardTitle></CardHeader>
            <CardContent>
              {!shipment.invoices?.length ? (
                <p className="text-sm text-[--color-muted-foreground]">Sin facturas ligadas.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {shipment.invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-[--color-muted-foreground]" />
                      <span className="font-mono">{inv.series}-{inv.folio}</span>
                      <Badge variant={inv.status === "stamped" ? "success" : inv.status === "cancelled" ? "destructive" : "outline"}>
                        {inv.status === "stamped" ? "Timbrada" : inv.status === "cancelled" ? "Cancelada" : "Borrador"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-[--color-muted-foreground]">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  )
}
