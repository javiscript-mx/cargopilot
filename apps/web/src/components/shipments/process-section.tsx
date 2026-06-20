import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Route, Truck, Plus, Trash2, Pencil, CheckCircle2, Circle, Star, MapPin, FileCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { useCan } from "@/lib/permissions"
import { LegDrawer } from "@/components/shipments/leg-drawer"
import { LegVehicleDrawer } from "@/components/shipments/leg-vehicle-drawer"
import { CartaPortePanel } from "@/components/shipments/carta-porte-panel"
import { TaskDrawer } from "@/components/shipments/task-drawer"
import { processApi, type ProcessTask, type ProcessLeg, type LegScope, type LegLocation, type LegVehicleAssignment } from "@/api/process"

// view: "flow" = checklist de fases (flujo de trabajo); "transport" = ruta/tramos/unidades/CP
// bare: sin Card propia (para integrarse dentro de una pestaña sin caja-en-caja)
export function ProcessSection({ shipmentId, locked = false, view = "flow", bare = false, onGoToTab }: { shipmentId: string; locked?: boolean; view?: "flow" | "transport"; bare?: boolean; onGoToTab?: (tab: string) => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // Gestionar (aplicar proceso, tramos) = operaciones; avanzar tareas = también finanzas.
  // Un expediente cancelado queda de solo lectura (locked).
  const { can } = useCan()
  const canManage = can("shipments.write") && !locked
  const canAdvance = can("shipments.advanceTask") && !locked

  const { data: process, isLoading } = useQuery({
    queryKey: ["process", shipmentId],
    queryFn: () => processApi.get(shipmentId),
  })
  const hasProcess = (process?.stages.length ?? 0) > 0

  const { data: templates = [] } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => processApi.templates(),
    enabled: canManage && !hasProcess,
  })
  const [templateCode, setTemplateCode] = useState("")
  const [editingLeg, setEditingLeg] = useState<ProcessLeg | null>(null)
  const [editingVehicle, setEditingVehicle] = useState<{ legId: string; vehicle: LegVehicleAssignment | null; index: number } | null>(null)
  const [cartaPorteUnit, setCartaPorteUnit] = useState<{ unit: LegVehicleAssignment; index: number } | null>(null)
  const [editingTask, setEditingTask] = useState<{ task: ProcessTask; isLeg: boolean } | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }) // bitácora
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  const applyMutation = useMutation({
    mutationFn: (code: string) => processApi.applyWorkflow(shipmentId, code),
    onSuccess: () => { invalidate(); toast.success("Proceso aplicado") },
    onError: (err: Error) => toast.error("No se pudo aplicar el proceso", err.message),
  })

  const addLegMutation = useMutation({
    mutationFn: (scope: LegScope) => processApi.addLeg(shipmentId, scope),
    onSuccess: (_, scope) => { invalidate(); toast.success(`Tramo ${scope === "foraneo" ? "con Carta Porte" : "sin Carta Porte"} agregado`) },
    onError: (err: Error) => toast.error("No se pudo agregar el tramo", err.message),
  })

  const deleteLegMutation = useMutation({
    mutationFn: (legId: string) => processApi.deleteLeg(legId),
    onSuccess: () => { invalidate(); toast.success("Tramo eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar el tramo", err.message),
  })

  const deleteVehicleMutation = useMutation({
    mutationFn: (vehicleId: string) => processApi.deleteVehicle(vehicleId),
    onSuccess: () => { invalidate(); toast.success("Unidad eliminada") },
    onError: (err: Error) => toast.error("No se pudo eliminar la unidad", err.message),
  })

  const taskMutation = useMutation({
    mutationFn: ({ task, isLeg, done }: { task: ProcessTask; isLeg: boolean; done: boolean }) => {
      const data = { status: done ? ("done" as const) : ("pending" as const) }
      return isLeg ? processApi.updateLegTask(task.id, data) : processApi.updateTask(task.id, data)
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error("No se pudo actualizar la tarea", err.message),
  })

  const bareCls = bare ? "border-0 bg-transparent shadow-none" : ""
  if (isLoading) {
    return (
      <Card className={bareCls}>
        <CardContent className={bare ? "py-6 text-center text-sm text-[--color-muted-foreground] px-0" : "py-6 text-center text-sm text-[--color-muted-foreground]"}>Cargando proceso...</CardContent>
      </Card>
    )
  }

  // ── Sin proceso aplicado ──
  if (!hasProcess) {
    if (view === "transport") {
      return (
        <Card className={bareCls}>
          <CardContent className={bare ? "py-6 text-center text-sm text-[--color-muted-foreground] px-0" : "py-6 text-center text-sm text-[--color-muted-foreground]"}>
            Aplica un proceso (pestaña Plan) para planear tramos y transporte.
          </CardContent>
        </Card>
      )
    }
    return (
      <Card className={bareCls}>
        <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-[--color-muted-foreground]" /> Flujo de trabajo
          </CardTitle>
        </CardHeader>
        <CardContent className={bare ? "p-0" : ""}>
          {!canManage ? (
            <p className="text-sm text-[--color-muted-foreground]">Este expediente no tiene un proceso aplicado.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[--color-muted-foreground]">
                Aplica un proceso para desglosar el expediente en fases y tramos.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Select
                    id="templateCode" label="Plantilla de proceso"
                    placeholder="Selecciona..."
                    options={templates.map((t) => ({ value: t.code, label: t.name }))}
                    value={templateCode}
                    onChange={(e) => setTemplateCode(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full sm:w-auto"
                  loading={applyMutation.isPending}
                  disabled={!templateCode}
                  onClick={() => templateCode && applyMutation.mutate(templateCode)}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const toggleTask = (task: ProcessTask, isLeg: boolean) =>
    taskMutation.mutate({ task, isLeg, done: task.status !== "done" })

  // Avance global del expediente: tareas de fases + tareas de todos los tramos
  const allTasks = [...process!.stages.flatMap((s) => s.tasks), ...process!.legs.flatMap((l) => l.tasks)]
  const doneTasks = allTasks.filter((t) => t.status === "done").length
  const pct = allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0

  const cardCls = bare ? "border-0 bg-transparent shadow-none" : ""

  return (
    <>
    <Card className={cardCls}>
      <CardHeader className={bare ? "p-0 pb-3" : "pb-3"}>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {view === "flow"
              ? <><Route className="h-4 w-4 text-[--color-muted-foreground]" /> Flujo de trabajo</>
              : <><Truck className="h-4 w-4 text-[--color-muted-foreground]" /> Ruta y transporte</>}
          </CardTitle>
          {view === "flow" && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[--color-muted]">
                <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="whitespace-nowrap text-xs text-[--color-muted-foreground]">{doneTasks}/{allTasks.length}</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className={bare ? "flex flex-col gap-5 p-0" : "flex flex-col gap-5"}>
        {/* Fases (flujo de trabajo) */}
        {view === "flow" && process!.stages.map((stage) => {
          const done = stage.tasks.filter((t) => t.status === "done").length
          return (
            <div key={stage.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-sm font-semibold">{stage.name}</h4>
                <span className="text-xs text-[--color-muted-foreground]">{done}/{stage.tasks.length}</span>
              </div>
              <div className="flex flex-col divide-y divide-[--color-border] rounded-md border border-[--color-border]">
                {stage.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} canAdvance={canAdvance} onToggle={() => toggleTask(task, false)} onEdit={() => setEditingTask({ task, isLeg: false })} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Tramos (ruta / transporte) */}
        {view === "transport" && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Truck className="h-4 w-4 text-[--color-muted-foreground]" /> Tramos
              <span className="font-normal text-[--color-muted-foreground]">({process!.legs.length})</span>
            </h4>
            {canManage && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" loading={addLegMutation.isPending && addLegMutation.variables === "foraneo"} onClick={() => addLegMutation.mutate("foraneo")}>
                  <Plus className="h-3.5 w-3.5" /> Con Carta Porte
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" loading={addLegMutation.isPending && addLegMutation.variables === "local"} onClick={() => addLegMutation.mutate("local")}>
                  <Plus className="h-3.5 w-3.5" /> Sin Carta Porte
                </Button>
              </div>
            )}
          </div>

          {process!.legs.length === 0 ? (
            <p className="rounded-md border border-dashed border-[--color-border] py-4 text-center text-sm text-[--color-muted-foreground]">
              Sin tramos. Agrega el primero (local o foráneo).
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {process!.legs.map((leg, idx) => {
                const done = leg.tasks.filter((t) => t.status === "done").length
                const num = idx + 1
                return (
                  <div key={leg.id} className="rounded-md border border-[--color-border]">
                    <div className="flex items-center justify-between gap-2 border-b border-[--color-border] bg-[--color-muted]/40 px-3 py-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Tramo {num}</span>
                          <Badge variant={leg.scope === "foraneo" ? "default" : "outline"}>
                            {leg.scope === "foraneo" ? "Requiere Carta Porte" : "Sin Carta Porte"}
                          </Badge>
                          <span className="text-xs text-[--color-muted-foreground]">{done}/{leg.tasks.length}</span>
                        </div>
                        {legRoute(leg) && (
                          <span className="flex items-center gap-1 truncate text-xs text-[--color-muted-foreground]">
                            <MapPin className="h-3 w-3 shrink-0" /> {legRoute(leg)}
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            title="Editar tramo"
                            onClick={() => setEditingLeg(leg)}
                            className="rounded p-1 text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="Eliminar tramo"
                            onClick={() => { if (confirm(`¿Eliminar el tramo ${num}?`)) deleteLegMutation.mutate(leg.id) }}
                            className="rounded p-1 text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Unidades de transporte del tramo */}
                    <div className="border-b border-[--color-border] px-3 py-2">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-[--color-muted-foreground]">
                          <Truck className="h-3.5 w-3.5" /> Unidades
                          {leg.vehicles.length > 1 && <Badge variant="warning">{leg.vehicles.length} unidades</Badge>}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => setEditingVehicle({ legId: leg.id, vehicle: null, index: leg.vehicles.length + 1 })}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-[--color-primary] hover:bg-[--color-muted]"
                          >
                            <Plus className="h-3 w-3" /> Agregar
                          </button>
                        )}
                      </div>
                      {leg.vehicles.length === 0 ? (
                        <p className="text-xs text-[--color-muted-foreground]">Sin unidad asignada.</p>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {leg.vehicles.map((v, vi) => {
                            const label = [v.carrierName, v.vehicleLabel, v.operatorName].filter(Boolean).join(" · ") || "Unidad sin datos"
                            const trailers = [v.trailer1Plate, v.trailer2Plate].filter(Boolean).length
                            return (
                              <div key={v.id} className="flex items-center justify-between gap-2 rounded bg-[--color-muted]/40 px-2 py-1">
                                <span className="flex min-w-0 items-center gap-1.5 text-xs">
                                  <span className="shrink-0 font-medium text-[--color-muted-foreground]">{vi + 1}.</span>
                                  <span className="truncate">{label}</span>
                                  {trailers > 0 && <Badge variant="outline">{trailers === 2 ? "Full" : "+1 remolque"}</Badge>}
                                  {v.cartaPorteInvoiceId && <Badge variant="success">CP timbrada</Badge>}
                                </span>
                                <div className="flex shrink-0 items-center gap-1">
                                  {leg.scope === "foraneo" && (
                                    <button title="Carta Porte" onClick={() => setCartaPorteUnit({ unit: v, index: vi + 1 })}
                                      className="rounded p-1 text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-primary]">
                                      <FileCheck className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {canManage && (
                                    <>
                                      <button title="Editar unidad" onClick={() => setEditingVehicle({ legId: leg.id, vehicle: v, index: vi + 1 })}
                                        className="rounded p-1 text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground]">
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      <button title="Quitar unidad" onClick={() => { if (confirm(`¿Quitar la unidad ${vi + 1} del tramo ${num}?`)) deleteVehicleMutation.mutate(v.id) }}
                                        className="rounded p-1 text-[--color-muted-foreground] hover:bg-red-50 hover:text-[--color-destructive]">
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col divide-y divide-[--color-border]">
                      {leg.tasks.map((task) => (
                        <TaskRow key={task.id} task={task} canAdvance={canAdvance} onToggle={() => toggleTask(task, true)} onEdit={() => setEditingTask({ task, isLeg: true })} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        )}
      </CardContent>
    </Card>
    {editingLeg && (
      <LegDrawer open onClose={() => setEditingLeg(null)} shipmentId={shipmentId} leg={editingLeg} />
    )}
    {editingVehicle && (
      <LegVehicleDrawer
        open onClose={() => setEditingVehicle(null)}
        shipmentId={shipmentId} legId={editingVehicle.legId}
        vehicle={editingVehicle.vehicle} index={editingVehicle.index}
      />
    )}
    {cartaPorteUnit && (
      <CartaPortePanel
        open onClose={() => setCartaPorteUnit(null)}
        shipmentId={shipmentId} unit={cartaPorteUnit.unit} index={cartaPorteUnit.index}
      />
    )}
    {editingTask && (
      <TaskDrawer open onClose={() => setEditingTask(null)} shipmentId={shipmentId} task={editingTask.task} isLeg={editingTask.isLeg} onGoToTab={onGoToTab} />
    )}
    </>
  )
}

// Resumen de ruta "Origen → Destino" a partir de las ubicaciones del tramo
function legRoute(leg: ProcessLeg): string | null {
  const name = (v: Record<string, unknown> | null) => (v as LegLocation | null)?.name?.trim()
  const from = name(leg.origin)
  const to = name(leg.destination)
  if (!from && !to) return null
  return `${from ?? "—"} → ${to ?? "—"}`
}

const STATUS_BADGE: Record<string, string> = {
  in_progress: "En progreso",
  blocked: "Bloqueada",
  skipped: "Omitida",
}

function TaskRow({ task, canAdvance, onToggle, onEdit }: { task: ProcessTask; canAdvance: boolean; onToggle: () => void; onEdit: () => void }) {
  const done = task.status === "done"
  const muted = done || task.status === "skipped"
  const badge = STATUS_BADGE[task.status]
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <button
        onClick={onToggle}
        disabled={!canAdvance}
        title={done ? "Marcar pendiente" : "Marcar completada"}
        className="mt-0.5 shrink-0 disabled:cursor-default"
      >
        {done
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <Circle className={task.status === "in_progress" ? "h-4 w-4 text-[--color-primary]" : "h-4 w-4 text-[--color-muted-foreground]"} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={muted ? "text-sm text-[--color-muted-foreground] line-through" : "text-sm"}>{task.name}</span>
          {task.isMilestone && <Star className="h-3 w-3 shrink-0 text-amber-500" aria-label="Hito" />}
          {badge && <span className="rounded-full bg-[--color-muted] px-1.5 py-0.5 text-[10px] font-medium text-[--color-muted-foreground]">{badge}</span>}
        </div>
        {(done || task.actualAt) && task.actualAt && (
          <p className="mt-0.5 text-xs text-[--color-muted-foreground]">
            {new Date(task.actualAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        )}
        {task.notes && <p className="mt-0.5 truncate text-xs text-[--color-muted-foreground]">{task.notes}</p>}
      </div>
      {canAdvance && (
        <button
          title="Editar tarea"
          onClick={onEdit}
          className="mt-0.5 shrink-0 rounded p-1 text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground]"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
