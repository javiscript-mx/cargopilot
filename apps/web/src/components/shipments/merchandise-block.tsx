import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, Package, Container as ContainerIcon } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { MoneyInput } from "@/components/ui/money-input"
import { SatPicker, type PickerItem } from "@/components/ui/sat-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { merchandiseApi, type Merchandise, MERCH_STATUS } from "@/api/merchandise"
import { containersApi } from "@/api/containers"
import { processApi } from "@/api/process"
import { satApi } from "@/api/sat"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { validateRequired, validateQuantity, validateWeight, collectErrors, scrollToFirstError } from "@/lib/validators"

// Límites de peso (transporte terrestre MX, NOM-012-SCT). Referencias de peso BRUTO máximo:
// tractocamión + semirremolque (T3S2/T3S3) ~ carga útil de una sola unidad; full/doble el doble.
// "Sobrepeso" se advierte contra una sola unidad y se LIMITA al máximo legal con doble.
const SINGLE_UNIT_PAYLOAD_KG = 30000 // carga útil típica de una unidad sencilla
const FULL_PAYLOAD_KG = 45000        // carga útil de un full/doble remolque
const LEGAL_MAX_PAYLOAD_KG = 75500   // tope legal con configuración full + permiso (ECA)
const MAX_CONTAINER_GROSS_KG = 30480 // peso bruto máximo ISO (20'/40') — carga útil = bruto − tara

// Clave producto/servicio SAT → picker. `goods: true` excluye servicios: la mercancía
// de un expediente es un BIEN transportable (Carta Porte), nunca un servicio del catálogo.
const searchProductKeys = async (q: string): Promise<PickerItem[]> =>
  (await satApi.searchProdserv(q, { goods: true })).map((p) => ({ code: p.code, label: `${p.code} · ${p.description}` }))
const resolveProductKey = async (code: string): Promise<PickerItem | null> => {
  const [p] = await satApi.getProdserv(code)
  return p ? { code: p.code, label: `${p.code} · ${p.description}` } : null
}

// Unidades de medida que tienen sentido para carga física, AGRUPADAS por dimensión
// (masa, conteo, volumen, longitud). Se acota a esta lista en vez de las ~4,000 del
// catálogo SAT para evitar incongruencias (p. ej. "kilowatts de perros": KWT ni siquiera
// aparece). Agrupar guía al usuario a elegir una unidad coherente con la mercancía.
const FREIGHT_UNIT_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  { label: "Masa / peso", options: [
    { value: "KGM", label: "KGM · Kilogramo" },
    { value: "TNE", label: "TNE · Tonelada" },
    { value: "GRM", label: "GRM · Gramo" },
    { value: "LBR", label: "LBR · Libra" },
  ] },
  { label: "Conteo / bultos", options: [
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
  ] },
  { label: "Volumen", options: [
    { value: "MTQ", label: "MTQ · Metro cúbico" },
    { value: "LTR", label: "LTR · Litro" },
    { value: "MLT", label: "MLT · Mililitro" },
  ] },
  { label: "Longitud / área", options: [
    { value: "MTR", label: "MTR · Metro" },
    { value: "MTK", label: "MTK · Metro cuadrado" },
  ] },
]
const FREIGHT_UNITS = FREIGHT_UNIT_GROUPS.flatMap((g) => g.options)

const EMPTY = {
  description: "", quantity: "", unitKey: "", weight: "", value: "", productKey: "", hsCode: "", containerId: "", notes: "",
}
// Valor del selector de unidad por tramo: "" = todo el tramo (sin unidad concreta)
const NO_UNIT = ""

export function MerchandiseBlock({
  shipmentId, canEdit, contenerizada,
}: { shipmentId: string; canEdit: boolean; contenerizada: boolean }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
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
  const legIndex = (id: string) => legs.findIndex((l) => l.id === id)
  // Opciones de unidad de un tramo (reparto de carga); "" = todo el tramo (sin unidad concreta)
  const unitOptions = (legId: string) => {
    const leg = legs.find((l) => l.id === legId)
    return [
      { value: NO_UNIT, label: "Todo el tramo (sin unidad)" },
      ...(leg?.vehicles ?? []).map((v, vi) => {
        const who = [v.carrierName, v.vehicleLabel].filter(Boolean).join(" · ")
        return { value: v.id, label: `Unidad ${vi + 1}${who ? ` — ${who}` : ""}` }
      }),
    ]
  }
  // Etiqueta de asignación en la lista: lista de tramos por los que viaja la partida
  const assignLabel = (m: Merchandise): string | null => {
    if (!m.legAssignments?.length) return null
    return m.legAssignments
      .map((a) => { const i = legIndex(a.legId); return i >= 0 ? `Tramo ${i + 1}` : null })
      .filter(Boolean)
      .join(", ") || null
  }

  const [show, setShow] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  // Asignación a tramos: { [legId]: unidad("" = sin unidad) }; ausencia = no asignado
  const [legAssign, setLegAssign] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const toggleLeg = (legId: string) => setLegAssign((a) => {
    const next = { ...a }
    if (legId in next) delete next[legId]
    else next[legId] = NO_UNIT
    return next
  })
  const setLegUnit = (legId: string, unit: string) => setLegAssign((a) => ({ ...a, [legId]: unit }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["merchandise", shipmentId] })
    queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const legAssignments = Object.entries(legAssign).map(([legId, unit]) => ({ legId, legVehicleId: unit || null }))
      const payload = {
        description: form.description.trim(),
        quantity: parseFloat(form.quantity),
        unitKey: form.unitKey || null,
        weight: form.weight ? parseFloat(form.weight) : null,
        value: form.value ? parseFloat(form.value) : null,
        productKey: form.productKey || null,
        hsCode: form.hsCode || null,
        containerId: form.containerId || null,
        legAssignments,
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

  function openNew() { setEditingId(null); setForm(EMPTY); setLegAssign({}); setErrors({}); setShow(true) }
  function openEdit(m: Merchandise) {
    setEditingId(m.id)
    setForm({
      description: m.description, quantity: m.quantity ?? "", unitKey: m.unitKey ?? "",
      weight: m.weight ?? "", value: m.value ?? "", productKey: m.productKey ?? "",
      hsCode: m.hsCode ?? "", containerId: m.containerId ?? "",
      notes: m.notes ?? "",
    })
    setLegAssign(Object.fromEntries((m.legAssignments ?? []).map((a) => [a.legId, a.legVehicleId ?? NO_UNIT])))
    setErrors({}); setShow(true)
  }
  function close() { setShow(false); setEditingId(null); setForm(EMPTY); setLegAssign({}); setErrors({}) }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      description: validateRequired(form.description, "Descripción"),
      quantity: validateQuantity(form.quantity),
      unitKey: form.unitKey ? undefined : "Selecciona la unidad de medida",
      weight: validateWeight(form.weight),
    })
    // Sobrepeso: el peso total de la carga no puede exceder el máximo legal (configuración full).
    const newWeight = form.weight ? parseFloat(form.weight) : 0
    const othersWeight = items.filter((m) => m.id !== editingId).reduce((a, m) => a + (m.weight ? parseFloat(m.weight) : 0), 0)
    const projected = othersWeight + newWeight
    if (!errs["weight"] && projected > LEGAL_MAX_PAYLOAD_KG) {
      errs["weight"] = `Sobrepeso: la carga sumaría ${projected.toLocaleString("es-MX")} kg y excede el máximo legal de ${LEGAL_MAX_PAYLOAD_KG.toLocaleString("es-MX")} kg.`
    }
    // Sobrepeso por contenedor: no asignar a un contenedor que ya superó su carga máxima
    if (!errs["weight"] && form.containerId) {
      const cont = containers.find((c) => c.id === form.containerId)
      const tare = cont?.tare ? parseFloat(cont.tare) : 0
      const maxPayload = MAX_CONTAINER_GROSS_KG - tare
      const contOthers = items.filter((m) => m.id !== editingId && m.containerId === form.containerId).reduce((a, m) => a + (m.weight ? parseFloat(m.weight) : 0), 0)
      if (contOthers + newWeight > maxPayload) {
        errs["containerId"] = `El contenedor superaría su carga máxima (${maxPayload.toLocaleString("es-MX")} kg). Reduce el peso o usa otro contenedor.`
      }
    }
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
  // conserva como grupo "Actual" para no perderla; las nuevas se eligen de la lista acotada.
  const unitGroups = form.unitKey && !FREIGHT_UNITS.some((u) => u.value === form.unitKey)
    ? [{ label: "Actual", options: [{ value: form.unitKey, label: form.unitKey }] }, ...FREIGHT_UNIT_GROUPS]
    : FREIGHT_UNIT_GROUPS

  const fmt = (n: string | null) => (n != null ? parseFloat(n).toLocaleString("es-MX") : null)

  // Peso total de la carga + bandera de sobrepeso (referencia legal de transporte terrestre)
  const totalWeight = items.reduce((a, m) => a + (m.weight ? parseFloat(m.weight) : 0), 0)
  const overweight = totalWeight > LEGAL_MAX_PAYLOAD_KG
    ? { level: "max", msg: `Excede el máximo legal (${LEGAL_MAX_PAYLOAD_KG.toLocaleString("es-MX")} kg).` }
    : totalWeight > FULL_PAYLOAD_KG
      ? { level: "full", msg: "Requiere configuración full / doble remolque." }
      : totalWeight > SINGLE_UNIT_PAYLOAD_KG
        ? { level: "single", msg: "Supera una unidad sencilla; reparte en varias unidades." }
        : null

  // Lista plana: el contenedor se muestra como chip por partida (no como encabezado
  // repetido) para no duplicar lo que ya lista el bloque de Contenedores.
  const groups = [{ key: "all", label: null as string | null, rows: items }]
  const containerLabel = (m: Merchandise) => (m.containerId ? containers.find((c) => c.id === m.containerId)?.number ?? null : null)

  const Line = (m: Merchandise) => (
    <div key={m.id} className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{m.description}</p>
          {m.status && m.status !== "in_transit" && <Badge variant={MERCH_STATUS[m.status].variant}>{MERCH_STATUS[m.status].label}</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted-foreground)]">
          <span>{fmt(m.quantity)}{m.unitKey ? ` ${m.unitKey}` : ""}</span>
          {m.weight && <span>{fmt(m.weight)} kg</span>}
          {m.value && <span>${fmt(m.value)}</span>}
          {m.hsCode && <span>Fracción: {m.hsCode}</span>}
          {contenerizada && containerLabel(m) && (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 font-mono text-[var(--color-foreground)]">
              <ContainerIcon className="h-3 w-3" /> {containerLabel(m)}
            </span>
          )}
          {assignLabel(m) && <span className="text-[var(--color-primary)]">{assignLabel(m)}</span>}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button title="Editar" onClick={() => openEdit(m)} className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button title="Eliminar" onClick={async () => { if (await confirm(`¿Eliminar "${m.description}"?`)) deleteMutation.mutate(m.id) }} className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-red-50 hover:text-[var(--color-destructive)]">
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
          <Package className="h-4 w-4 text-[var(--color-muted-foreground)]" /> Mercancías
          <span className="text-[var(--color-muted-foreground)]">({items.length})</span>
        </h3>
        <div className="flex items-center gap-2">
          {totalWeight > 0 && (
            <span className="text-xs text-[var(--color-muted-foreground)]">Total: <span className="font-medium text-[var(--color-foreground)]">{totalWeight.toLocaleString("es-MX")} kg</span></span>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={openNew}>
              <Plus className="h-3.5 w-3.5" /> Agregar mercancía
            </Button>
          )}
        </div>
      </div>

      {overweight && (
        <div className={`mb-2 flex items-start gap-2 rounded-md border p-2 text-xs ${overweight.level === "max" ? "border-[var(--color-destructive)] bg-red-50 text-[var(--color-destructive)]" : "border-amber-300 bg-amber-50/60 text-amber-800"}`}>
          <span className="font-semibold">{overweight.level === "max" ? "Sobrepeso ilegal:" : "Aviso de peso:"}</span>
          <span>{totalWeight.toLocaleString("es-MX")} kg — {overweight.msg}</span>
        </div>
      )}

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
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">Qué es</h4>
              <Input id="description" label="Descripción" value={form.description} onChange={set("description")} placeholder="Mercancía general, autopartes..." error={errors.description} />
              <Input id="quantity" label="Cantidad" type="number" min="0" step="0.001" value={form.quantity} onChange={set("quantity")} error={errors.quantity} />
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">Claves SAT (Carta Porte)</h4>
              <SatPicker
                label="Producto (SAT · solo bienes)" cacheKey="prodserv"
                value={form.productKey} onChange={(code) => setForm((f) => ({ ...f, productKey: code }))}
                search={searchProductKeys} resolve={resolveProductKey}
                placeholder="Buscar producto (sin servicios)..."
              />
              <Select
                id="unitKey" label="Unidad de medida" placeholder="Selecciona..."
                groups={unitGroups} value={form.unitKey} onChange={set("unitKey")}
                error={errors.unitKey}
              />
              <Input id="hsCode" label="Fracción arancelaria (opcional)" value={form.hsCode} onChange={set("hsCode")} placeholder="Comercio exterior" />
            </section>

            <section className="flex flex-col gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">Peso y valor</h4>
              <div className="grid grid-cols-2 gap-3">
                <Input id="weight" label="Peso (kg)" type="number" min="0" step="0.001" value={form.weight} onChange={set("weight")} error={errors.weight} />
                <MoneyInput id="value" label="Valor (MXN)" value={form.value} onChange={(v) => setForm((f) => ({ ...f, value: v }))} />
              </div>
            </section>

            {(contenerizada || legs.length > 0) && (
              <section className="flex flex-col gap-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">Asignación</h4>
                {contenerizada && (
                  <Select
                    id="containerId" label="Contenedor (opcional)"
                    placeholder="Sin asignar"
                    options={containers.map((c) => ({ value: c.id, label: c.number }))}
                    value={form.containerId} onChange={set("containerId")}
                    error={errors.containerId}
                  />
                )}
                {legs.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-[var(--color-foreground)]">Tramos por los que viaja</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Marca cada tramo en el que va esta mercancía (puede ir en varios). El estado se calcula solo según el avance de cada tramo.
                    </p>
                    {legs.map((l, i) => {
                      const on = l.id in legAssign
                      return (
                        <div key={l.id} className="rounded-md border border-[var(--color-border)] p-2">
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={on} onChange={() => toggleLeg(l.id)} className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]" />
                            <span className="font-medium">Tramo {i + 1}</span>
                            <span className="text-xs text-[var(--color-muted-foreground)]">{l.scope === "foraneo" ? "Requiere Carta Porte" : "Sin Carta Porte"}</span>
                          </label>
                          {on && l.vehicles.length > 0 && (
                            <div className="mt-2 pl-6">
                              <Select id={`unit-${l.id}`} options={unitOptions(l.id)} value={legAssign[l.id] ?? NO_UNIT} onChange={(e) => setLegUnit(l.id, e.target.value)} />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
          </form>
        </Drawer>
      )}

      {items.length === 0 ? (
        <p className="py-3 text-center text-sm text-[var(--color-muted-foreground)]">Sin mercancías registradas.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.key}>
              {g.label && (
                <p className="mb-0.5 mt-1 font-mono text-xs font-semibold text-[var(--color-muted-foreground)]">{g.label}</p>
              )}
              <div className="flex flex-col divide-y divide-[var(--color-border)]">
                {g.rows.map((m) => Line(m))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
