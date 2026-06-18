import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Package } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { merchandiseApi, type Merchandise } from "@/api/merchandise"
import { containersApi } from "@/api/containers"
import { useCatalog } from "@/hooks/use-catalog"
import { useToast } from "@/components/ui/toast"

const EMPTY = {
  description: "", quantity: "", unitKey: "", weight: "", value: "", productKey: "", hsCode: "", containerId: "", notes: "",
}

export function MerchandiseBlock({
  shipmentId, canEdit, contenerizada,
}: { shipmentId: string; canEdit: boolean; contenerizada: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: items = [] } = useQuery({
    queryKey: ["merchandise", shipmentId],
    queryFn: () => merchandiseApi.list(shipmentId),
  })
  const { data: containers = [] } = useQuery({
    queryKey: ["containers", shipmentId],
    queryFn: () => containersApi.list(shipmentId),
    enabled: contenerizada,
  })
  const { simpleOptions: unitOptions } = useCatalog("sat_unit_key")
  const { simpleOptions: productOptions } = useCatalog("sat_product_key")
  const unitLabel = (code: string | null) => (code ? unitOptions.find((o) => o.value === code)?.label ?? code : null)
  const containerNumber = (id: string | null) => (id ? containers.find((c) => c.id === id)?.number ?? "Contenedor" : null)

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState("")

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["merchandise", shipmentId] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        description: form.description.trim(),
        quantity: parseFloat(form.quantity),
        unitKey: form.unitKey || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        value: form.value ? parseFloat(form.value) : null,
        productKey: form.productKey || null,
        hsCode: form.hsCode || null,
        containerId: form.containerId || null,
        notes: form.notes || null,
      }
      return editingId ? merchandiseApi.update(editingId, payload) : merchandiseApi.create({ shipmentId, ...payload })
    },
    onSuccess: () => {
      invalidate()
      toast.success(editingId ? "Mercancía actualizada" : "Mercancía agregada")
      close()
    },
    onError: (err: Error) => setError(err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: merchandiseApi.delete,
    onSuccess: () => { invalidate(); toast.success("Mercancía eliminada") },
    onError: (err: Error) => toast.error("No se pudo eliminar la mercancía", err.message),
  })

  function openNew() { setEditingId(null); setForm(EMPTY); setError(""); setShow(true) }
  function openEdit(m: Merchandise) {
    setEditingId(m.id)
    setForm({
      description: m.description, quantity: m.quantity ?? "", unitKey: m.unitKey ?? "",
      weight: m.weight ?? "", value: m.value ?? "", productKey: m.productKey ?? "",
      hsCode: m.hsCode ?? "", containerId: m.containerId ?? "", notes: m.notes ?? "",
    })
    setError(""); setShow(true)
  }
  function close() { setShow(false); setEditingId(null); setForm(EMPTY); setError("") }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim()) { setError("La descripción es obligatoria"); return }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { setError("La cantidad debe ser mayor a 0"); return }
    saveMutation.mutate()
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const fmt = (n: string | null) => (n != null ? parseFloat(n).toLocaleString("es-MX") : null)

  // Agrupar por contenedor cuando es contenerizada
  const groups = contenerizada
    ? [
        ...containers.map((c) => ({ key: c.id, label: c.number, rows: items.filter((m) => m.containerId === c.id) })),
        { key: "none", label: "Sin contenedor", rows: items.filter((m) => !m.containerId) },
      ].filter((g) => g.rows.length > 0)
    : [{ key: "all", label: null as string | null, rows: items }]

  const Line = (m: Merchandise) => (
    <div key={m.id} className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{m.description}</p>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[--color-muted-foreground]">
          <span>{fmt(m.quantity)}{unitLabel(m.unitKey) ? ` ${unitLabel(m.unitKey)}` : ""}</span>
          {m.weight && <span>{fmt(m.weight)} kg</span>}
          {m.value && <span>${fmt(m.value)}</span>}
          {m.hsCode && <span>Fracción: {m.hsCode}</span>}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button title="Editar" onClick={() => openEdit(m)} className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground]">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button title="Eliminar" onClick={() => { if (confirm(`¿Eliminar "${m.description}"?`)) deleteMutation.mutate(m.id) }} className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive]">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4 text-[--color-muted-foreground]" /> Mercancías
          <span className="text-[--color-muted-foreground]">({items.length})</span>
        </h3>
        {canEdit && (
          <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Agregar mercancía
          </Button>
        )}
      </div>

      {canEdit && (
        <Drawer
          open={show}
          onClose={close}
          title={editingId ? "Editar mercancía" : "Nueva mercancía"}
          description="Partida de carga para el complemento Carta Porte."
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={close}>Cancelar</Button>
              <Button type="submit" form="merchandise-form" size="sm" loading={saveMutation.isPending}>
                {editingId ? "Guardar cambios" : "Agregar"}
              </Button>
            </div>
          }
        >
          <form id="merchandise-form" onSubmit={handleSave} className="flex flex-col gap-3">
            <Input id="description" label="Descripción" value={form.description} onChange={set("description")} placeholder="Mercancía general, autopartes..." />
            <div className="grid grid-cols-2 gap-3">
              <Input id="quantity" label="Cantidad" type="number" min="0" step="0.001" value={form.quantity} onChange={set("quantity")} />
              <Select id="unitKey" label="Unidad (SAT)" placeholder="Selecciona..." options={unitOptions} value={form.unitKey} onChange={set("unitKey")} />
            </div>
            <Select id="productKey" label="Clave producto SAT" placeholder="Selecciona..." options={productOptions} value={form.productKey} onChange={set("productKey")} />
            <div className="grid grid-cols-2 gap-3">
              <Input id="weight" label="Peso (kg)" type="number" min="0" step="0.001" value={form.weight} onChange={set("weight")} />
              <Input id="value" label="Valor (MXN)" type="number" min="0" step="0.01" value={form.value} onChange={set("value")} />
            </div>
            <Input id="hsCode" label="Fracción arancelaria (opcional)" value={form.hsCode} onChange={set("hsCode")} placeholder="Comercio exterior" />
            {contenerizada && (
              <Select
                id="containerId" label="Contenedor (opcional)"
                placeholder="Sin asignar"
                options={containers.map((c) => ({ value: c.id, label: c.number }))}
                value={form.containerId} onChange={set("containerId")}
              />
            )}
            <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
            {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
          </form>
        </Drawer>
      )}

      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-[--color-muted-foreground]">Sin mercancías registradas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.key}>
              {g.label && (
                <p className="mb-0.5 mt-1 font-mono text-xs font-semibold text-[--color-muted-foreground]">{g.label}</p>
              )}
              <div className="flex flex-col divide-y divide-[--color-border]">
                {g.rows.map((m) => Line(m))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
