import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Route, Truck, Plus, Trash2, Pencil, CheckCircle2, Circle, Star, MapPin } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { LegDrawer } from "@/components/shipments/leg-drawer"
import { processApi, type ProcessTask, type ProcessLeg, type LegScope, type LegLocation } from "@/api/process"

export function ProcessSection({ shipmentId, canEdit }: { shipmentId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: process, isLoading } = useQuery({
    queryKey: ["process", shipmentId],
    queryFn: () => processApi.get(shipmentId),
  })
  const hasProcess = (process?.stages.length ?? 0) > 0

  const { data: templates = [] } = useQuery({
    queryKey: ["workflow-templates"],
    queryFn: () => processApi.templates(),
    enabled: canEdit && !hasProcess,
  })
  const [templateCode, setTemplateCode] = useState("")
  const [editingLeg, setEditingLeg] = useState<ProcessLeg | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] }) // bitácora
  }

  const applyMutation = useMutation({
    mutationFn: (code: string) => processApi.applyWorkflow(shipmentId, code),
    onSuccess: () => { invalidate(); toast.success("Proceso aplicado") },
    onError: (err: Error) => toast.error("No se pudo aplicar el proceso", err.message),
  })

  const addLegMutation = useMutation({
    mutationFn: (scope: LegScope) => processApi.addLeg(shipmentId, scope),
    onSuccess: (_, scope) => { invalidate(); toast.success(`Tramo ${scope === "local" ? "local" : "foráneo"} agregado`) },
    onError: (err: Error) => toast.error("No se pudo agregar el tramo", err.message),
  })

  const deleteLegMutation = useMutation({
    mutationFn: (legId: string) => processApi.deleteLeg(legId),
    onSuccess: () => { invalidate(); toast.success("Tramo eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar el tramo", err.message),
  })

  const taskMutation = useMutation({
    mutationFn: ({ task, isLeg, done }: { task: ProcessTask; isLeg: boolean; done: boolean }) => {
      const data = { status: done ? ("done" as const) : ("pending" as const) }
      return isLeg ? processApi.updateLegTask(task.id, data) : processApi.updateTask(task.id, data)
    },
    onSuccess: () => invalidate(),
    onError: (err: Error) => toast.error("No se pudo actualizar la tarea", err.message),
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-[--color-muted-foreground]">Cargando proceso...</CardContent>
      </Card>
    )
  }

  // ── Sin proceso aplicado ──
  if (!hasProcess) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-[--color-muted-foreground]" /> Proceso
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!canEdit ? (
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

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-[--color-muted-foreground]" /> Proceso
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[--color-muted]">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs text-[--color-muted-foreground]">{doneTasks}/{allTasks.length}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Fases */}
        {process!.stages.map((stage) => {
          const done = stage.tasks.filter((t) => t.status === "done").length
          return (
            <div key={stage.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-sm font-semibold">{stage.name}</h4>
                <span className="text-xs text-[--color-muted-foreground]">{done}/{stage.tasks.length}</span>
              </div>
              <div className="flex flex-col divide-y divide-[--color-border] rounded-md border border-[--color-border]">
                {stage.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} canEdit={canEdit} onToggle={() => toggleTask(task, false)} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Tramos */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Truck className="h-4 w-4 text-[--color-muted-foreground]" /> Tramos
              <span className="font-normal text-[--color-muted-foreground]">({process!.legs.length})</span>
            </h4>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" loading={addLegMutation.isPending && addLegMutation.variables === "local"} onClick={() => addLegMutation.mutate("local")}>
                  <Plus className="h-3.5 w-3.5" /> Local
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" loading={addLegMutation.isPending && addLegMutation.variables === "foraneo"} onClick={() => addLegMutation.mutate("foraneo")}>
                  <Plus className="h-3.5 w-3.5" /> Foráneo
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
                const carrier = [leg.carrierName, leg.vehicleLabel, leg.operatorName].filter(Boolean).join(" · ")
                return (
                  <div key={leg.id} className="rounded-md border border-[--color-border]">
                    <div className="flex items-center justify-between gap-2 border-b border-[--color-border] bg-[--color-muted]/40 px-3 py-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">Tramo {num}</span>
                          <Badge variant={leg.scope === "foraneo" ? "default" : "outline"}>
                            {leg.scope === "foraneo" ? "Foráneo · Carta Porte" : "Local"}
                          </Badge>
                          <span className="text-xs text-[--color-muted-foreground]">{done}/{leg.tasks.length}</span>
                        </div>
                        {legRoute(leg) && (
                          <span className="flex items-center gap-1 truncate text-xs text-[--color-muted-foreground]">
                            <MapPin className="h-3 w-3 shrink-0" /> {legRoute(leg)}
                          </span>
                        )}
                        {carrier && (
                          <span className="flex items-center gap-1 truncate text-xs text-[--color-muted-foreground]">
                            <Truck className="h-3 w-3 shrink-0" /> {carrier}
                          </span>
                        )}
                      </div>
                      {canEdit && (
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
                    <div className="flex flex-col divide-y divide-[--color-border]">
                      {leg.tasks.map((task) => (
                        <TaskRow key={task.id} task={task} canEdit={canEdit} onToggle={() => toggleTask(task, true)} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    {editingLeg && (
      <LegDrawer open onClose={() => setEditingLeg(null)} shipmentId={shipmentId} leg={editingLeg} />
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

function TaskRow({ task, canEdit, onToggle }: { task: ProcessTask; canEdit: boolean; onToggle: () => void }) {
  const done = task.status === "done"
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <button
        onClick={onToggle}
        disabled={!canEdit}
        title={done ? "Marcar pendiente" : "Marcar completada"}
        className="mt-0.5 shrink-0 disabled:cursor-default"
      >
        {done
          ? <CheckCircle2 className="h-4 w-4 text-green-600" />
          : <Circle className="h-4 w-4 text-[--color-muted-foreground]" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={done ? "text-sm text-[--color-muted-foreground] line-through" : "text-sm"}>{task.name}</span>
          {task.isMilestone && <Star className="h-3 w-3 shrink-0 text-amber-500" aria-label="Hito" />}
        </div>
        {done && task.actualAt && (
          <p className="mt-0.5 text-xs text-[--color-muted-foreground]">
            {new Date(task.actualAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        )}
      </div>
    </div>
  )
}
