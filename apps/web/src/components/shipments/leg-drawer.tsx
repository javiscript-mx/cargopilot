import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddressInput, type AddressValue } from "@/components/ui/address-input"
import { useToast } from "@/components/ui/toast"
import { validateRfc, validateCp, collectErrors, scrollToFirstError } from "@/lib/validators"
import { processApi, type ProcessLeg, type LegLocation, type LegPatch } from "@/api/process"
import { shipmentsApi } from "@/api/shipments"
import { customersApi, type CustomerAddress } from "@/api/customers"

const LEG_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En progreso" },
  { value: "done", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
]

// La pregunta operativa real es si el tramo requiere Carta Porte (foráneo) o no (local)
const LEG_SCOPE_OPTIONS = [
  { value: "foraneo", label: "Sí — requiere Carta Porte (foráneo)" },
  { value: "local", label: "No — sin Carta Porte (local)" },
]

// c_Estado SAT (Carta Porte). Catálogo chico → constante para un Select sin error humano.
const ESTADOS = [
  ["AGU", "Aguascalientes"], ["BCN", "Baja California"], ["BCS", "Baja California Sur"], ["CAM", "Campeche"],
  ["CHP", "Chiapas"], ["CHH", "Chihuahua"], ["CMX", "Ciudad de México"], ["COA", "Coahuila"], ["COL", "Colima"],
  ["DUR", "Durango"], ["MEX", "Estado de México"], ["GUA", "Guanajuato"], ["GRO", "Guerrero"], ["HID", "Hidalgo"],
  ["JAL", "Jalisco"], ["MIC", "Michoacán"], ["MOR", "Morelos"], ["NAY", "Nayarit"], ["NLE", "Nuevo León"],
  ["OAX", "Oaxaca"], ["PUE", "Puebla"], ["QUE", "Querétaro"], ["ROO", "Quintana Roo"], ["SLP", "San Luis Potosí"],
  ["SIN", "Sinaloa"], ["SON", "Sonora"], ["TAB", "Tabasco"], ["TAM", "Tamaulipas"], ["TLA", "Tlaxcala"],
  ["VER", "Veracruz"], ["YUC", "Yucatán"], ["ZAC", "Zacatecas"],
] as const
const ESTADO_OPTIONS = ESTADOS.map(([value, label]) => ({ value, label: `${label} (${value})` }))
// Mapea un texto libre de estado (p. ej. de una dirección de cliente) al código SAT
function toEstadoCode(v: string | undefined | null): string {
  if (!v) return ""
  const t = v.trim().toLowerCase()
  const hit = ESTADOS.find(([code, name]) => code.toLowerCase() === t || name.toLowerCase() === t)
  return hit ? hit[0] : ""
}
// Nombre legible de un código c_Estado SAT
function estadoName(code: string | undefined | null): string {
  if (!code) return ""
  return ESTADOS.find(([c]) => c === code)?.[1] ?? code
}

// datetime-local <-> ISO respetando zona horaria local
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const toISO = (local: string): string | null => (local ? new Date(local).toISOString() : null)

const asLoc = (v: Record<string, unknown> | null): LegLocation => (v ?? {}) as LegLocation

// El tramo es el segmento de ruta (origen→destino, fechas). El transporte (unidades)
// se gestiona aparte, ya que un tramo puede correrse con varias unidades.
export function LegDrawer({
  open, onClose, shipmentId, leg,
}: { open: boolean; onClose: () => void; shipmentId: string; leg: ProcessLeg }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const o = asLoc(leg.origin)
  const d = asLoc(leg.destination)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    scope: leg.scope,
    status: leg.status,
    originName: o.name ?? "", originRfc: o.rfc ?? "", originZip: o.zip ?? "", originState: o.state ?? "", originAddress: o.address ?? "",
    originLat: o.lat ?? null as number | null, originLng: o.lng ?? null as number | null,
    destName: d.name ?? "", destRfc: d.rfc ?? "", destZip: d.zip ?? "", destState: d.state ?? "", destAddress: d.address ?? "",
    destLat: d.lat ?? null as number | null, destLng: d.lng ?? null as number | null,
    distanceKm: leg.distanceKm ?? "",
    plannedPickupAt: toLocalInput(leg.plannedPickupAt),
    plannedDeliveryAt: toLocalInput(leg.plannedDeliveryAt),
    notes: leg.notes ?? "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Selección de Google Maps → deriva domicilio + CP + Estado SAT + lat/lng (no se teclean a mano)
  function onPlace(side: "origin" | "dest", formatted: string, detail?: AddressValue) {
    setForm((f) => {
      if (!detail) return side === "origin" ? { ...f, originAddress: formatted } : { ...f, destAddress: formatted }
      const zip = detail.postalCode ?? ""
      const state = toEstadoCode(detail.state)
      const lat = detail.lat ?? null
      const lng = detail.lng ?? null
      return side === "origin"
        ? { ...f, originAddress: formatted, originZip: zip || f.originZip, originState: state || f.originState, originLat: lat, originLng: lng }
        : { ...f, destAddress: formatted, destZip: zip || f.destZip, destState: state || f.destState, destLat: lat, destLng: lng }
    })
  }

  // Precarga desde el customer master: direcciones del cliente del expediente → ubicación del tramo
  const { data: shipment } = useQuery({ queryKey: ["shipments", shipmentId], queryFn: () => shipmentsApi.get(shipmentId) })
  const customerId = shipment?.customer.id
  const { data: customer } = useQuery({ queryKey: ["customers", customerId], queryFn: () => customersApi.get(customerId!), enabled: Boolean(customerId) })
  const custAddresses = (customer?.addresses ?? []) as CustomerAddress[]
  const addrLabel = (a: CustomerAddress) => [a.label, a.formatted].filter(Boolean).join(" · ") || a.type
  function prefill(side: "origin" | "dest", addrId: string) {
    const a = custAddresses.find((x) => x.id === addrId)
    if (!a) return
    const name = customer?.legalName ?? customer?.name ?? ""
    const rfc = customer?.rfc ?? ""
    const zip = a.postalCode ?? ""
    const address = a.formatted ?? ""
    const state = toEstadoCode(a.state)
    const lat = a.lat ?? null
    const lng = a.lng ?? null
    setForm((f) => side === "origin"
      ? { ...f, originName: name, originRfc: rfc, originZip: zip, originState: state || f.originState, originAddress: address, originLat: lat, originLng: lng }
      : { ...f, destName: name, destRfc: rfc, destZip: zip, destState: state || f.destState, destAddress: address, destLat: lat, destLng: lng })
  }

  const loc = (
    name: string, rfc: string, zip: string, state: string, address: string,
    lat: number | null, lng: number | null,
  ): LegLocation | null => {
    const v: LegLocation = {}
    if (name.trim()) v.name = name.trim()
    if (rfc.trim()) v.rfc = rfc.trim().toUpperCase()
    if (zip.trim()) v.zip = zip.trim()
    if (state.trim()) v.state = state.trim()
    if (address.trim()) v.address = address.trim()
    if (lat != null) v.lat = lat
    if (lng != null) v.lng = lng
    return Object.keys(v).length ? v : null
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: LegPatch = {
        scope: form.scope,
        status: form.status,
        origin: loc(form.originName, form.originRfc, form.originZip, form.originState, form.originAddress, form.originLat, form.originLng),
        destination: loc(form.destName, form.destRfc, form.destZip, form.destState, form.destAddress, form.destLat, form.destLng),
        distanceKm: form.distanceKm ? Number(form.distanceKm) : null,
        plannedPickupAt: toISO(form.plannedPickupAt),
        plannedDeliveryAt: toISO(form.plannedDeliveryAt),
        // actualPickupAt/actualDeliveryAt NO se editan aquí: son de las tareas de recolección/entrega
        notes: form.notes.trim() || null,
      }
      return processApi.updateLeg(leg.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      toast.success("Tramo actualizado")
      onClose()
    },
    onError: (err: Error) => toast.error("No se pudo guardar el tramo", err.message),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    // Validación ligera: RFC/CP solo si se capturaron (la carga es progresiva).
    const errs = collectErrors({
      originRfc: validateRfc(form.originRfc, { required: false }),
      destRfc: validateRfc(form.destRfc, { required: false }),
      originZip: validateCp(form.originZip),
      destZip: validateCp(form.destZip),
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

  const foraneo = form.scope === "foraneo"

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Tramo ${leg.order} · ${foraneo ? "Foráneo" : "Local"}`}
      description={foraneo ? "Segmento de ruta y ubicaciones para la Carta Porte. El transporte se asigna en las unidades del tramo." : "Segmento de ruta del tramo local."}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="leg-form" size="sm" loading={saveMutation.isPending}>Guardar cambios</Button>
        </div>
      }
    >
      <form id="leg-form" onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Select id="scope" label="¿Este tramo requiere Carta Porte?" options={LEG_SCOPE_OPTIONS} value={form.scope} onChange={set("scope")} />
          {form.scope !== leg.scope && (
            <p className="text-xs text-[--color-muted-foreground]">
              Cambiar esto ajusta el checklist del tramo (agrega o quita las tareas de Carta Porte).
            </p>
          )}
        </div>
        <Select id="status" label="Estado del tramo" options={LEG_STATUS_OPTIONS} value={form.status} onChange={set("status")} />

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Origen</h4>
          {custAddresses.length > 0 && (
            <Select id="prefill-origin" label="Prellenar desde el cliente" placeholder="Selecciona una dirección…"
              options={custAddresses.map((a) => ({ value: a.id!, label: addrLabel(a) }))}
              value="" onChange={(e) => e.target.value && prefill("origin", e.target.value)} />
          )}
          <Input id="originName" label="Nombre / razón social" value={form.originName} onChange={set("originName")} />
          <Input id="originRfc" label="RFC" value={form.originRfc} onChange={set("originRfc")} maxLength={13} error={errors["originRfc"]} />
          <AddressInput id="originAddress" label="Domicilio (Google Maps)" placeholder="Busca el origen en el mapa…"
            value={form.originAddress} onChange={(formatted, detail) => onPlace("origin", formatted, detail)} />
          {form.originZip && form.originState ? (
            <p className="-mt-1 text-xs text-[--color-muted-foreground]">
              Ubicación: CP <span className="font-medium text-[--color-foreground]">{form.originZip}</span> · {estadoName(form.originState)} ({form.originState})
            </p>
          ) : form.originAddress ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-amber-300 bg-amber-50/40 p-2">
              <Input id="originZip" label="CP (completar)" value={form.originZip} onChange={set("originZip")} maxLength={5} error={errors["originZip"]} />
              <Select id="originState" label="Estado (SAT)" placeholder="Selecciona…" options={ESTADO_OPTIONS} value={form.originState} onChange={set("originState")} />
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Destino</h4>
          {custAddresses.length > 0 && (
            <Select id="prefill-dest" label="Prellenar desde el cliente" placeholder="Selecciona una dirección…"
              options={custAddresses.map((a) => ({ value: a.id!, label: addrLabel(a) }))}
              value="" onChange={(e) => e.target.value && prefill("dest", e.target.value)} />
          )}
          <Input id="destName" label="Nombre / razón social" value={form.destName} onChange={set("destName")} />
          <Input id="destRfc" label="RFC" value={form.destRfc} onChange={set("destRfc")} maxLength={13} error={errors["destRfc"]} />
          <AddressInput id="destAddress" label="Domicilio (Google Maps)" placeholder="Busca el destino en el mapa…"
            value={form.destAddress} onChange={(formatted, detail) => onPlace("dest", formatted, detail)} />
          {form.destZip && form.destState ? (
            <p className="-mt-1 text-xs text-[--color-muted-foreground]">
              Ubicación: CP <span className="font-medium text-[--color-foreground]">{form.destZip}</span> · {estadoName(form.destState)} ({form.destState})
            </p>
          ) : form.destAddress ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-amber-300 bg-amber-50/40 p-2">
              <Input id="destZip" label="CP (completar)" value={form.destZip} onChange={set("destZip")} maxLength={5} error={errors["destZip"]} />
              <Select id="destState" label="Estado (SAT)" placeholder="Selecciona…" options={ESTADO_OPTIONS} value={form.destState} onChange={set("destState")} />
            </div>
          ) : null}
        </section>

        <Input
          id="distanceKm" label="Distancia recorrida (km)" type="number" min="0" step="0.01"
          value={String(form.distanceKm)} onChange={set("distanceKm")}
        />

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Programación</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input id="plannedPickupAt" label="Recolección programada" type="datetime-local" value={form.plannedPickupAt} onChange={set("plannedPickupAt")} />
            <Input id="plannedDeliveryAt" label="Entrega estimada (ETA)" type="datetime-local" value={form.plannedDeliveryAt} onChange={set("plannedDeliveryAt")} />
          </div>
          <p className="text-xs text-[--color-muted-foreground]">
            Las fechas reales se registran al marcar las tareas de recolección y entrega del tramo.
          </p>
        </section>

        <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
      </form>
    </Drawer>
  )
}
