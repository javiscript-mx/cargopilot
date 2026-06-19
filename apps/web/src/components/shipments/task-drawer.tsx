import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { processApi, type ProcessTask } from "@/api/process"

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
  open, onClose, shipmentId, task, isLeg,
}: { open: boolean; onClose: () => void; shipmentId: string; task: ProcessTask; isLeg: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [form, setForm] = useState({
    status: task.status,
    plannedAt: toLocalInput(task.plannedAt),
    actualAt: toLocalInput(task.actualAt),
    notes: task.notes ?? "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

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
    saveMutation.mutate()
  }

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
      <form id="task-form" onSubmit={handleSave} className="flex flex-col gap-4">
        <Select id="status" label="Estado" options={TASK_STATUS_OPTIONS} value={form.status} onChange={set("status")} />
        <Input id="plannedAt" label="Fecha planeada" type="datetime-local" value={form.plannedAt} onChange={set("plannedAt")} />
        <Input
          id="actualAt"
          label={task.isMilestone ? "Fecha real del hito" : "Fecha de realización"}
          type="datetime-local" value={form.actualAt} onChange={set("actualAt")}
        />
        <p className="-mt-2 text-xs text-[--color-muted-foreground]">
          Puedes registrar una fecha pasada (p. ej. la recolección fue ayer).
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="notes" className="text-sm font-medium text-[--color-foreground]">Notas</label>
          <textarea
            id="notes" rows={3} value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="w-full rounded-md border border-[--color-border] bg-[--color-background] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
          />
        </div>
      </form>
    </Drawer>
  )
}
