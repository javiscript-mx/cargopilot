import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Flag, MessageSquare, ArrowRightLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { useCatalog } from "@/hooks/use-catalog"
import { shipmentsApi, type ShipmentEvent } from "@/api/shipments"
import { validateDateField, findIncompleteDateInputs } from "@/lib/validators"

const EVENT_ICONS: Record<ShipmentEvent["type"], typeof Flag> = {
  status_change: ArrowRightLeft,
  milestone: Flag,
  note: MessageSquare,
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

// Bitácora / timeline del expediente (eventos automáticos + hitos/notas manuales).
export function LogSection({ shipmentId, canEdit, canDelete }: { shipmentId: string; canEdit: boolean; canDelete: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { simpleOptions: milestoneOptions } = useCatalog("milestone")
  const { data: shipment } = useQuery({ queryKey: ["shipments", shipmentId], queryFn: () => shipmentsApi.get(shipmentId) })
  const events = shipment?.events ?? []

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ kind: "milestone" as "milestone" | "note", milestone: "", title: "", detail: "", occurredAt: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  const addMutation = useMutation({
    mutationFn: () => {
      const title = form.kind === "milestone"
        ? milestoneOptions.find((m) => m.value === form.milestone)?.label ?? form.milestone
        : form.title
      return shipmentsApi.addEvent(shipmentId, {
        type: form.kind, title,
        ...(form.detail ? { detail: form.detail } : {}),
        ...(form.occurredAt ? { occurredAt: new Date(form.occurredAt).toISOString() } : {}),
      })
    },
    onSuccess: () => {
      invalidate()
      setForm({ kind: "milestone", milestone: "", title: "", detail: "", occurredAt: "" })
      setShowForm(false); setErrors({})
      toast.success("Evento agregado a la bitácora")
    },
    onError: (err: Error) => toast.error("No se pudo registrar el evento", err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (eventId: string) => shipmentsApi.deleteEvent(shipmentId, eventId),
    onSuccess: () => { invalidate(); toast.success("Evento eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar el evento", err.message),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (form.kind === "milestone" && !form.milestone) errs.milestone = "Selecciona un hito"
    if (form.kind === "note" && form.title.trim().length < 2) errs.title = "Escribe un título para la nota"
    // El suceso ya ocurrió: no puede registrarse en el futuro.
    const occErr = validateDateField(form.occurredAt, { notFuture: true, label: "La fecha del suceso" })
    if (occErr) errs.eventDate = occErr
    for (const inc of findIncompleteDateInputs(document.getElementById("log-event-form") ?? document)) {
      errs[inc.id] = inc.message
    }
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de registrar.")
      return
    }
    setErrors({})
    addMutation.mutate()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Bitácora</CardTitle>
        {canEdit && (
          <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> Registrar evento
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {showForm && (
          <form id="log-event-form" onSubmit={handleAdd} className="mb-5 flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
            <div className="flex gap-2">
              {(["milestone", "note"] as const).map((kind) => (
                <button key={kind} type="button" onClick={() => setForm((f) => ({ ...f, kind }))}
                  className={["rounded-full px-3 py-1 text-xs font-medium transition-colors", form.kind === kind ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"].join(" ")}>
                  {kind === "milestone" ? "Hito" : "Nota libre"}
                </button>
              ))}
            </div>
            {form.kind === "milestone" ? (
              <Select id="milestone" label="Hito" placeholder="Selecciona un hito..." options={milestoneOptions}
                value={form.milestone} onChange={(e) => setForm((f) => ({ ...f, milestone: e.target.value }))} error={errors.milestone} />
            ) : (
              <Input id="eventTitle" label="Título" placeholder="Qué sucedió..." value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} error={errors.title} />
            )}
            <Input id="eventDetail" label="Detalle (opcional)" placeholder="Información adicional, referencias..." value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} />
            <Input id="eventDate" label="Fecha y hora del suceso (vacío = ahora)" type="datetime-local" value={form.occurredAt}
              onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))} error={errors.eventDate} />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={addMutation.isPending}>Registrar</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setErrors({}) }}>Cancelar</Button>
            </div>
          </form>
        )}

        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin eventos registrados.</p>
        ) : (
          <div className="relative flex flex-col">
            {events.map((event, idx) => {
              const Icon = EVENT_ICONS[event.type] ?? MessageSquare
              const isLast = idx === events.length - 1
              return (
                <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {!isLast && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--color-border)]" />}
                  <div className={["z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
                    event.type === "status_change" ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : event.type === "milestone" ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]"].join(" ")}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{event.title}</p>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">{formatDateTime(event.occurredAt)}</span>
                        {canDelete && event.source !== "system" && (
                          <button title="Eliminar evento" onClick={async () => { if (await confirm("¿Eliminar este evento de la bitácora?")) deleteMutation.mutate(event.id) }}
                            className="rounded p-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                    {event.detail && <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{event.detail}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
