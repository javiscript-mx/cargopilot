import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Package } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { SatPicker, type PickerItem } from "@/components/ui/sat-picker"
import { Button } from "@/components/ui/button"
import { merchandiseApi, type Merchandise } from "@/api/merchandise"
import { containersApi } from "@/api/containers"
import { processApi } from "@/api/process"
import { satApi } from "@/api/sat"
import { useToast } from "@/components/ui/toast"
import { validateRequired, validateQuantity, collectErrors, scrollToFirstError } from "@/lib/validators"

// Clave producto/servicio SAT → picker. `goods: true` excluye servicios: la mercancía
// de un expediente es un BIEN transportable (Carta Porte), nunca un servicio del catálogo.
const searchProductKeys = async (q: string): Promise<PickerItem[]> =>
  (await satApi.searchProdserv(q, { goods: true })).map((p) => ({ code: p.code, label: `${p.code} · ${p.description}` }))
const resolveProductKey = async (code: string): Promise<PickerItem | null> => {
  const [p] = await satApi.getProdserv(code)
  return p ? { code: p.code, label: `${p.code} · ${p.description}` } : null
}

// Unidades de medida que tienen sentido para carga física (masa, conteo, volumen,
// longitud, empaque). Se acota a esta lista en vez de las ~4,000 del catálogo SAT para
// evitar errores absurdos (p. ej. "kilowatts de perros"). Codigos c_ClaveUnidad.
const FREIGHT_UNITS: { value: string; label: string }[] = [
  { value: "KGM", label: "KGM · Kilogramo" },
  { value: "TNE", label: "TNE · Tonelada" },
  { value: "GRM", label: "GRM · Gramo" },
  { value: "LBR", label: "LBR · Libra" },
  { value: "H87", label: "H87 · Pieza" },
  { value: "XUN", label: "XUN · Unidad" },
  { value: "C62", label: "C62 · Uno" },
  { value: "DPC", label: "DPC · Docena de piezas" },
  { value: "XPK", label: "XPK · Paquete" },
  { value: "XBX", label: "XBX · Caja" },
  { value: "XCT", label: "XCT · Cartón" },
  { value: "XBG", label: "XBG · Bolsa" },
  { value: "XSA", label: "XSA · Saco" },
  { value: "XPX", label: "XPX · Pallet / tarima" },
  { value: "XRO", label: "XRO · Rollo" },
  { value: "MTQ", label: "MTQ · Metro cúbico" },
  { value: "LTR", label: "LTR · Litro" },
  { value: "MLT", label: "MLT · Mililitro" },
  { value: "MTR", label: "MTR · Metro" },
  { value: "MTK", label: "MTK · Metro cuadrado" },
]

const EMPTY = {
  description: "", quantity: "", unitKey: "", weight: "", value: "", productKey: "", hsCode: "", containerId: "", assign: "", notes: "",
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
  // Tramos del proceso (para asignar qué unidad transporta la mercancía — Carta Porte)
  const { data: process } = useQuery({
    queryKey: ["process", shipmentId],
    queryFn: () => processApi.get(shipmentId),
  })
  const legs = process?.legs ?? []
  // Opciones de asignación: una por unidad de transporte (reparto de carga); si un
  // tramo no tiene unidades, se ofrece el tramo "sin unidad". El value codifica el
  // destino: "v:<unidadId>" o "l:<tramoId>".
  const assignOptions = legs.flatMap((l, i) =>
    l.vehicles.length
      ? l.vehicles.map((v, vi) => {
          const who = [v.carrierName, v.vehicleLabel].filter(Boolean).join(" · ")
          return { value: `v:${v.id}`, label: `Tramo ${i + 1} · Unidad ${vi + 1}${who ? ` — ${who}` : ""}` }
        })
      : [{ value: `l:${l.id}`, label: `Tramo ${i + 1} (sin unidad)` }],
  )
  // Etiqueta para mostrar la asignación de una partida en la lista
  const assignLabel = (m: Merchandise): string | null => {
    if (m.legVehicleId) {
      const opt = assignOptions.find((o) => o.value === `v:${m.legVehicleId}`)
      if (opt) return opt.label
    }
    if (m.legId) {
      const i = legs.findIndex((l) => l.id === m.legId)
      if (i >= 0) return `Tramo ${i + 1} (${legs[i]!.scope === "foraneo" ? "foráneo" : "local"})`
    }
    return null
  }

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["merchandise", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  // Decodifica el value del selector a { legId, legVehicleId }
  const resolveAssign = (assign: string): { legId: string | null; legVehicleId: string | null } => {
    if (assign.startsWith("v:")) {
      const legVehicleId = assign.slice(2)
      const leg = legs.find((l) => l.vehicles.some((v) => v.id === legVehicleId))
      return { legId: leg?.id ?? null, legVehicleId }
    }
    if (assign.startsWith("l:")) return { legId: assign.slice(2), legVehicleId: null }
    return { legId: null, legVehicleId: null }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const { legId, legVehicleId } = resolveAssign(form.assign)
      const payload = {
        description: form.description.trim(),
        quantity: parseFloat(form.quantity),
        unitKey: form.unitKey || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        value: form.value ? parseFloat(form.value) : null,
        productKey: form.productKey || null,
        hsCode: form.hsCode || null,
        containerId: form.containerId || null,
        legId,
        legVehicleId,
        notes: form.notes || null,
      }
      return editingId ? merchandiseApi.update(editingId, payload) : merchandiseApi.create({ shipmentId, ...payload })
    },
    onSuccess: () => {
      invalidate()
      toast.success(editingId ? "Mercancía actualizada" : "Mercancía agregada")
      close()
    },
    onError: (err: Error) => toast.error("No se pudo guardar la mercancía", err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: merchandiseApi.delete,
    onSuccess: () => { invalidate(); toast.success("Mercancía eliminada") },
    onError: (err: Error) => toast.error("No se pudo eliminar la mercancía", err.message),
  })

  function openNew() { setEditingId(null); setForm(EMPTY); setErrors({}); setShow(true) }
  function openEdit(m: Merchandise) {
    setEditingId(m.id)
    setForm({
      description: m.description, quantity: m.quantity ?? "", unitKey: m.unitKey ?? "",
      weight: m.weight ?? "", value: m.value ?? "", productKey: m.productKey ?? "",
      hsCode: m.hsCode ?? "", containerId: m.containerId ?? "",
      assign: m.legVehicleId ? `v:${m.legVehicleId}` : m.legId ? `l:${m.legId}` : "",
      notes: m.notes ?? "",
    })
    setErrors({}); setShow(true)
  }
  function close() { setShow(false); setEditingId(null); setForm(EMPTY); setErrors({}) }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      description: validateRequired(form.description, "Descripción"),
      quantity: validateQuantity(form.quantity),
      unitKey: form.unitKey ? undefined : "Selecciona la unidad de medida",
    })
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
    setErrors({})
    saveMutation.mutate()
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Si la partida ya traía una unidad fuera de la lista de carga (datos viejos), se
  // conserva como opción para no perderla, pero las nuevas se eligen de la lista acotada.
  const unitOptions = form.unitKey && !FREIGHT_UNITS.some((u) => u.value === form.unitKey)
    ? [{ value: form.unitKey, label: form.unitKey }, ...FREIGHT_UNITS]
    : FREIGHT_UNITS

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
          <span>{fmt(m.quantity)}{m.unitKey ? ` ${m.unitKey}` : ""}</span>
          {m.weight && <span>{fmt(m.weight)} kg</span>}
          {m.value && <span>${fmt(m.value)}</span>}
          {m.hsCode && <span>Fracción: {m.hsCode}</span>}
          {assignLabel(m) && <span className="text-[--color-primary]">{assignLabel(m)}</span>}
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
          <form id="merchandise-form" onSubmit={handleSave} className="flex flex-col gap-5">
            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted-foreground]">Qué es</h4>
              <Input id="description" label="Descripción" value={form.description} onChange={set("description")} placeholder="Mercancía general, autopartes..." error={errors.description} />
              <Input id="quantity" label="Cantidad" type="number" min="0" step="0.001" value={form.quantity} onChange={set("quantity")} error={errors.quantity} />
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted-foreground]">Claves SAT (Carta Porte)</h4>
              <SatPicker
                label="Producto (SAT · solo bienes)" cacheKey="prodserv"
                value={form.productKey} onChange={(code) => setForm((f) => ({ ...f, productKey: code }))}
                search={searchProductKeys} resolve={resolveProductKey}
                placeholder="Buscar producto (sin servicios)..."
              />
              <Select
                id="unitKey" label="Unidad de medida" placeholder="Selecciona..."
                options={unitOptions} value={form.unitKey} onChange={set("unitKey")}
                error={errors.unitKey}
              />
              <Input id="hsCode" label="Fracción arancelaria (opcional)" value={form.hsCode} onChange={set("hsCode")} placeholder="Comercio exterior" />
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted-foreground]">Peso y valor</h4>
              <div className="grid grid-cols-2 gap-3">
                <Input id="weight" label="Peso (kg)" type="number" min="0" step="0.001" value={form.weight} onChange={set("weight")} />
                <Input id="value" label="Valor (MXN)" type="number" min="0" step="0.01" value={form.value} onChange={set("value")} />
              </div>
            </section>

            {(contenerizada || assignOptions.length > 0) && (
              <section className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[--color-muted-foreground]">Asignación</h4>
                {contenerizada && (
                  <Select
                    id="containerId" label="Contenedor (opcional)"
                    placeholder="Sin asignar"
                    options={containers.map((c) => ({ value: c.id, label: c.number }))}
                    value={form.containerId} onChange={set("containerId")}
                  />
                )}
                {assignOptions.length > 0 && (
                  <Select
                    id="assign" label="Tramo / unidad (opcional)"
                    placeholder="Sin asignar"
                    options={assignOptions}
                    value={form.assign} onChange={set("assign")}
                  />
                )}
              </section>
            )}

            <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
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
