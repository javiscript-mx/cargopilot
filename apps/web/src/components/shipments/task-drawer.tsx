import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useToast } from "@/components/ui/toast"
import { processApi, type ProcessTask } from "@/api/process"
import { validateDateField, findIncompleteDateInputs, collectErrors, scrollToFirstError } from "@/lib/validators"

const TASK_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En progreso" },
  { value: "done", label: "Completada" },
  { value: "blocked", label: "Bloqueada" },
  { value: "skipped", label: "Omitida" },
]

// datetime-local <-> ISO respetando zona horaria local
const toLocalInput = (iso: string | null): string => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const toISO = (local: string): string | null => (local ? new Date(local).toISOString() : null)

export function TaskDrawer({
  open, onClose, shipmentId, task, isLeg, onGoToTab,
}: { open: boolean; onClose: () => void; shipmentId: string; task: ProcessTask; isLeg: boolean; onGoToTab?: (tab: string) => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // Tareas de ejecución cuya fecha real pertenece al tramo (fuente única de fechas)
  const isExecutionTask = isLeg && (task.code === "recoleccion" || task.code === "entrega")

  const [form, setForm] = useState({
    status: task.status,
    plannedAt: toLocalInput(task.plannedAt),
    actualAt: toLocalInput(task.actualAt),
    notes: task.notes ?? "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const [errors, setErrors] = useState<Record<string, string>>({})

  const saveMutation = useMutation({
    mutationFn: () => {
      const data = {
        status: form.status,
        plannedAt: toISO(form.plannedAt),
        actualAt: toISO(form.actualAt),
        notes: form.notes.trim() || null,
      }
      return isLeg ? processApi.updateLegTask(task.id, data) : processApi.updateTask(task.id, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] })
      toast.success("Tarea actualizada")
      onClose()
    },
    onError: (err: Error) => toast.error("No se pudo actualizar la tarea", err.message),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const originalPlanned = toLocalInput(task.plannedAt)
    const errs = collectErrors({
      // La fecha planeada es a futuro; si ya existía una pasada y no se cambió, no se exige corregir.
      plannedAt: form.plannedAt && form.plannedAt !== originalPlanned
        ? validateDateField(form.plannedAt, { notPast: true, label: "La fecha planeada" })
        : undefined,
      // La fecha real (de realización) ya ocurrió: no puede ser futura.
      actualAt: validateDateField(form.actualAt, { notFuture: true, label: "La fecha real" }),
    })
    for (const inc of findIncompleteDateInputs(document.getElementById("task-form") ?? document)) {
      errs[inc.id] = inc.message
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      scrollToFirstError()
      return
    }
    setErrors({})
    saveMutation.mutate()
  }

  // Tareas que se gestionan en la pestaña Fiscal (no se duplica el form aquí)
  const fiscalTask = !isLeg && (task.kind === "quote" || task.kind === "invoice")

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={task.name}
      description={task.isMilestone ? "Hito del proceso" : "Tarea del proceso"}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="task-form" size="sm" loading={saveMutation.isPending}>Guardar cambios</Button>
        </div>
      }
    >
      {/* La cotización y la facturación se gestionan en la pestaña Fiscal: aquí solo
          se marca el avance del paso (no se duplica el formulario). */}
      {fiscalTask && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {task.kind === "quote" ? "La tarifa se captura en la pestaña Fiscal." : "La factura se genera y timbra en la pestaña Fiscal."}
          </p>
          {onGoToTab && (
            <Button type="button" size="sm" variant="outline" className="flex shrink-0 items-center gap-1"
              onClick={() => { onGoToTab("fiscal"); onClose() }}>
              Ir a Fiscal <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}

      <form id="task-form" onSubmit={handleSave} className="flex flex-col gap-4">
        <Select id="status" label="Estado" options={TASK_STATUS_OPTIONS} value={form.status} onChange={set("status")} />
        {/* Recolección/entrega: la fecha real es la del TRAMO (fuente única). La planeada
            vive en el tramo, por eso aquí no se muestra. */}
        {!isExecutionTask && (
          <Input id="plannedAt" label="Fecha planeada" type="datetime-local" value={form.plannedAt} onChange={set("plannedAt")} error={errors.plannedAt} />
        )}
        <Input
          id="actualAt"
          label={isExecutionTask
            ? (task.code === "recoleccion" ? "Fecha real de recolección" : "Fecha real de entrega")
            : (task.isMilestone ? "Fecha real del hito" : "Fecha de realización")}
          type="datetime-local" value={form.actualAt} onChange={set("actualAt")} error={errors.actualAt}
        />
        <p className="-mt-2 text-xs text-[var(--color-muted-foreground)]">
          {isExecutionTask
            ? "Se guarda como la fecha oficial del tramo (alimenta Carta Porte y el cierre)."
            : "Puedes registrar una fecha pasada (p. ej. la recolección fue ayer)."}
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-[var(--color-foreground)]">Notas</label>
          <textarea
            id="notes" rows={3} value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </form>
    </Drawer>
  )
}
