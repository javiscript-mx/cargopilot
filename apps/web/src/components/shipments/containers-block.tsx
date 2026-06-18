import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Container as ContainerIcon } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { containersApi, type Container } from "@/api/containers"
import { useCatalog } from "@/hooks/use-catalog"
import { useToast } from "@/components/ui/toast"

const EMPTY = { number: "", type: "", seal: "", tare: "", notes: "" }

export function ContainersBlock({ shipmentId, canEdit }: { shipmentId: string; canEdit: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: items = [] } = useQuery({
    queryKey: ["containers", shipmentId],
    queryFn: () => containersApi.list(shipmentId),
  })
  const { simpleOptions: typeOptions } = useCatalog("container_type")
  const typeLabel = (code: string | null) => (code ? typeOptions.find((o) => o.value === code)?.label ?? code : null)

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState("")

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["containers", shipmentId] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        number: form.number.trim().toUpperCase(),
        type: form.type || null,
        seal: form.seal || null,
        tare: form.tare ? parseFloat(form.tare) : null,
        notes: form.notes || null,
      }
      return editingId ? containersApi.update(editingId, payload) : containersApi.create({ shipmentId, ...payload })
    },
    onSuccess: () => {
      invalidate()
      toast.success(editingId ? "Contenedor actualizado" : "Contenedor agregado")
      close()
    },
    onError: (err: Error) => setError(err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: containersApi.delete,
    onSuccess: () => { invalidate(); toast.success("Contenedor eliminado") },
    onError: (err: Error) => toast.error("No se pudo eliminar el contenedor", err.message),
  })

  function openNew() { setEditingId(null); setForm(EMPTY); setError(""); setShow(true) }
  function openEdit(c: Container) {
    setEditingId(c.id)
    setForm({ number: c.number, type: c.type ?? "", seal: c.seal ?? "", tare: c.tare ?? "", notes: c.notes ?? "" })
    setError(""); setShow(true)
  }
  function close() { setShow(false); setEditingId(null); setForm(EMPTY); setError("") }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.number.trim()) { setError("El número de contenedor es obligatorio"); return }
    saveMutation.mutate()
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ContainerIcon className="h-4 w-4 text-[--color-muted-foreground]" /> Contenedores
          <span className="text-[--color-muted-foreground]">({items.length})</span>
        </h3>
        {canEdit && (
          <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Agregar contenedor
          </Button>
        )}
      </div>

      {canEdit && (
        <Drawer
          open={show}
          onClose={close}
          title={editingId ? "Editar contenedor" : "Nuevo contenedor"}
          description="Datos del contenedor para el complemento Carta Porte."
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit" form="container-form" size="sm" loading={saveMutation.isPending}>
                {editingId ? "Guardar cambios" : "Agregar"}
              </Button>
            </div>
          }
        >
          <form id="container-form" onSubmit={handleSave} className="flex flex-col gap-3">
            <Input id="number" label="Número / matrícula" value={form.number} onChange={set("number")} placeholder="MSKU1234567" />
            <Select id="type" label="Tipo de contenedor" placeholder="Selecciona..." options={typeOptions} value={form.type} onChange={set("type")} />
            <div className="grid grid-cols-2 gap-3">
              <Input id="seal" label="Sello / precinto" value={form.seal} onChange={set("seal")} />
              <Input id="tare" label="Tara (kg)" type="number" min="0" step="0.001" value={form.tare} onChange={set("tare")} />
            </div>
            <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
            {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
          </form>
        </Drawer>
      )}

      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-[--color-muted-foreground]">Sin contenedores registrados.</p>
      ) : (
        <div className="flex flex-col divide-y divide-[--color-border]">
          {items.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-medium">{c.number}</span>
                  {typeLabel(c.type) && <span className="text-xs text-[--color-muted-foreground]">{typeLabel(c.type)}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[--color-muted-foreground]">
                  {c.seal && <span>Sello: {c.seal}</span>}
                  {c.tare && <span>Tara: {parseFloat(c.tare).toLocaleString("es-MX")} kg</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <button title="Editar" onClick={() => openEdit(c)} className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground]">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button title="Eliminar" onClick={() => { if (confirm(`¿Eliminar el contenedor ${c.number}?`)) deleteMutation.mutate(c.id) }} className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
