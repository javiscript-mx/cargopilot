import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Info, Send, MapPinned, CalendarClock } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddressInput, type AddressValue } from "@/components/ui/address-input"
import { useToast } from "@/components/ui/toast"
import { geocodeAddress, drivingDistanceKm } from "@/lib/maps"
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
    originLat: o.lat ?? null as number | null, originLng: o.lng ?? null as number | null, originAddrId: "",
    destName: d.name ?? "", destRfc: d.rfc ?? "", destZip: d.zip ?? "", destState: d.state ?? "", destAddress: d.address ?? "",
    destLat: d.lat ?? null as number | null, destLng: d.lng ?? null as number | null, destAddrId: "",
    distanceKm: leg.distanceKm ?? "",
    plannedPickupAt: toLocalInput(leg.plannedPickupAt),
    plannedDeliveryAt: toLocalInput(leg.plannedDeliveryAt),
    notes: leg.notes ?? "",
  })
  // Si el tramo ya traía distancia, se respeta (manual); si no, se calcula sola con Google.
  const [distanceManual, setDistanceManual] = useState(Boolean(leg.distanceKm))
  const [distanceAuto, setDistanceAuto] = useState(false)
  const [calcDistance, setCalcDistance] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const bothCoords = form.originLat != null && form.originLng != null && form.destLat != null && form.destLng != null

  // Distancia por carretera con Google a partir de las coordenadas de ambos extremos.
  async function computeDistance() {
    if (!bothCoords) return
    setCalcDistance(true)
    const km = await drivingDistanceKm(
      { lat: form.originLat!, lng: form.originLng! },
      { lat: form.destLat!, lng: form.destLng! },
    )
    setCalcDistance(false)
    if (km != null) { setForm((f) => ({ ...f, distanceKm: String(km) })); setDistanceAuto(true); setDistanceManual(false) }
    else toast.error("No se pudo calcular la distancia", "Verifica que ambos puntos tengan ubicación de Google.")
  }

  // Recalcula la distancia cuando cambian las coordenadas (al elegir/prellenar origen y destino),
  // salvo que el usuario la haya escrito a mano. Cubre el caso de "Usar datos del cliente".
  useEffect(() => {
    if (distanceManual || !bothCoords) return
    let cancelled = false
    drivingDistanceKm(
      { lat: form.originLat!, lng: form.originLng! },
      { lat: form.destLat!, lng: form.destLng! },
    ).then((km) => { if (!cancelled && km != null) { setForm((f) => ({ ...f, distanceKm: String(km) })); setDistanceAuto(true) } })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.originLat, form.originLng, form.destLat, form.destLng, distanceManual])

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
  async function prefill(side: "origin" | "dest", addrId: string) {
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
      ? { ...f, originName: name, originRfc: rfc, originZip: zip, originState: state || f.originState, originAddress: address, originLat: lat, originLng: lng, originAddrId: addrId }
      : { ...f, destName: name, destRfc: rfc, destZip: zip, destState: state || f.destState, destAddress: address, destLat: lat, destLng: lng, destAddrId: addrId })
    // Si la dirección del cliente se guardó sin CP/Estado/coords, los completamos
    // geocodificando con Google (antes solo se llenaban al elegir en el mapa → se veía como bug).
    if (address && (!zip || !state || lat == null)) {
      const geo = await geocodeAddress(address)
      if (geo) {
        setForm((f) => side === "origin"
          ? { ...f, originZip: geo.postalCode ?? f.originZip, originState: toEstadoCode(geo.state) || f.originState, originLat: geo.lat ?? f.originLat, originLng: geo.lng ?? f.originLng }
          : { ...f, destZip: geo.postalCode ?? f.destZip, destState: toEstadoCode(geo.state) || f.destState, destLat: geo.lat ?? f.destLat, destLng: geo.lng ?? f.destLng })
      }
    }
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

  // Origen y destino no pueden ser el mismo lugar (mismas coordenadas o mismo domicilio).
  function sameLocation(): boolean {
    const sameCoord = form.originLat != null && form.destLat != null
      && Math.abs(form.originLat - form.destLat) < 1e-5 && Math.abs((form.originLng ?? 0) - (form.destLng ?? 0)) < 1e-5
    const a = form.originAddress.trim().toLowerCase()
    const b = form.destAddress.trim().toLowerCase()
    return sameCoord || (a.length > 0 && a === b)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const isForaneo = form.scope === "foraneo"
    // RFC de remitente/destinatario es OBLIGATORIO en tramos foráneos (Carta Porte).
    const errs = collectErrors({
      originRfc: validateRfc(form.originRfc, { required: isForaneo }),
      destRfc: validateRfc(form.destRfc, { required: isForaneo }),
      originZip: validateCp(form.originZip),
      destZip: validateCp(form.destZip),
    })
    if (sameLocation()) {
      errs["destAddress"] = "El destino no puede ser el mismo que el origen."
    }
    // Recolección no se programa en el pasado (solo si el usuario la cambió a una fecha pasada).
    const nowL = toLocalInput(new Date().toISOString())
    const originalPickup = toLocalInput(leg.plannedPickupAt)
    if (form.plannedPickupAt && form.plannedPickupAt !== originalPickup && form.plannedPickupAt < nowL) {
      errs["plannedPickupAt"] = "La recolección no puede programarse en el pasado."
    }
    if (form.plannedPickupAt && form.plannedDeliveryAt && form.plannedDeliveryAt < form.plannedPickupAt) {
      errs["plannedDeliveryAt"] = "La entrega no puede ser antes de la recolección."
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

  const foraneo = form.scope === "foraneo"

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Tramo ${leg.order} · ${foraneo ? "Foráneo" : "Local"}`}
      description="Define la ruta del tramo: quién envía, quién recibe y por dónde pasa."
      className="max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="leg-form" size="sm" loading={saveMutation.isPending}>Guardar cambios</Button>
        </div>
      }
    >
      <form id="leg-form" onSubmit={handleSave} className="flex flex-col gap-5">
        {/* Tipo de tramo + estado */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Select id="scope" label="¿Requiere Carta Porte?" options={LEG_SCOPE_OPTIONS} value={form.scope} onChange={set("scope")} />
            {form.scope !== leg.scope && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Cambiar esto ajusta el checklist del tramo (agrega o quita las tareas de Carta Porte).
              </p>
            )}
          </div>
          <Select id="status" label="Estado del tramo" options={LEG_STATUS_OPTIONS} value={form.status} onChange={set("status")} />
        </div>

        {/* Aclaración Emisor/Receptor vs Remitente/Destinatario */}
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <p>
            En la Carta Porte el <span className="font-medium text-[var(--color-foreground)]">emisor es tu empresa</span> y el{" "}
            <span className="font-medium text-[var(--color-foreground)]">receptor es el cliente</span> — eso se define al facturar.
            Aquí solo indicas quién <span className="font-medium text-[var(--color-foreground)]">envía</span> (remitente) y quién{" "}
            <span className="font-medium text-[var(--color-foreground)]">recibe</span> (destinatario) la mercancía en este tramo.
          </p>
        </div>

        {/* Remitente · origen */}
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><Send className="h-4 w-4" /></span>
            <div>
              <h4 className="text-sm font-semibold">Remitente · origen</h4>
              <p className="text-xs text-[var(--color-muted-foreground)]">Quién entrega la mercancía y dónde se recoge.</p>
            </div>
          </div>
          {custAddresses.length > 0 && (
            <Select id="prefill-origin" label="Usar datos del cliente" placeholder="Selecciona una dirección…"
              options={custAddresses.filter((a) => a.id !== form.destAddrId).map((a) => ({ value: a.id!, label: addrLabel(a) }))}
              value="" onChange={(e) => e.target.value && prefill("origin", e.target.value)} />
          )}
          <Input id="originName" label="Remitente (nombre o razón social)" value={form.originName} onChange={set("originName")} placeholder="Quién envía la mercancía" />
          <Input id="originRfc" label={foraneo ? "RFC del remitente (obligatorio)" : "RFC del remitente"} value={form.originRfc} onChange={set("originRfc")} maxLength={13} error={errors["originRfc"]} />
          <AddressInput id="originAddress" label="Domicilio de recolección (Google Maps)" placeholder="Busca el origen en el mapa…"
            value={form.originAddress} onChange={(formatted, detail) => onPlace("origin", formatted, detail)} />
          {form.originZip && form.originState ? (
            <p className="-mt-1 text-xs text-[var(--color-muted-foreground)]">
              Ubicación: CP <span className="font-medium text-[var(--color-foreground)]">{form.originZip}</span> · {estadoName(form.originState)} ({form.originState})
            </p>
          ) : form.originAddress ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-amber-300 bg-amber-50/40 p-2">
              <Input id="originZip" label="CP (completar)" value={form.originZip} onChange={set("originZip")} maxLength={5} error={errors["originZip"]} />
              <Select id="originState" label="Estado (SAT)" placeholder="Selecciona…" options={ESTADO_OPTIONS} value={form.originState} onChange={set("originState")} />
            </div>
          ) : null}
        </section>

        {/* Destinatario · destino */}
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><MapPinned className="h-4 w-4" /></span>
            <div>
              <h4 className="text-sm font-semibold">Destinatario · destino</h4>
              <p className="text-xs text-[var(--color-muted-foreground)]">Quién recibe la mercancía y dónde se entrega.</p>
            </div>
          </div>
          {custAddresses.length > 0 && (
            <Select id="prefill-dest" label="Usar datos del cliente" placeholder="Selecciona una dirección…"
              options={custAddresses.filter((a) => a.id !== form.originAddrId).map((a) => ({ value: a.id!, label: addrLabel(a) }))}
              value="" onChange={(e) => e.target.value && prefill("dest", e.target.value)} />
          )}
          <Input id="destName" label="Destinatario (nombre o razón social)" value={form.destName} onChange={set("destName")} placeholder="Quién recibe la mercancía" />
          <Input id="destRfc" label={foraneo ? "RFC del destinatario (obligatorio)" : "RFC del destinatario"} value={form.destRfc} onChange={set("destRfc")} maxLength={13} error={errors["destRfc"]} />
          <AddressInput id="destAddress" label="Domicilio de entrega (Google Maps)" placeholder="Busca el destino en el mapa…"
            value={form.destAddress} onChange={(formatted, detail) => onPlace("dest", formatted, detail)} error={errors["destAddress"]} />
          {form.destZip && form.destState ? (
            <p className="-mt-1 text-xs text-[var(--color-muted-foreground)]">
              Ubicación: CP <span className="font-medium text-[var(--color-foreground)]">{form.destZip}</span> · {estadoName(form.destState)} ({form.destState})
            </p>
          ) : form.destAddress ? (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-amber-300 bg-amber-50/40 p-2">
              <Input id="destZip" label="CP (completar)" value={form.destZip} onChange={set("destZip")} maxLength={5} error={errors["destZip"]} />
              <Select id="destState" label="Estado (SAT)" placeholder="Selecciona…" options={ESTADO_OPTIONS} value={form.destState} onChange={set("destState")} />
            </div>
          ) : null}
        </section>

        {/* Programación y distancia */}
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[var(--color-primary)]"><CalendarClock className="h-4 w-4" /></span>
            <div>
              <h4 className="text-sm font-semibold">Programación y distancia</h4>
              <p className="text-xs text-[var(--color-muted-foreground)]">Fechas planeadas y kilómetros del tramo.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input id="plannedPickupAt" label="Recolección programada" type="datetime-local" min={toLocalInput(new Date().toISOString())} value={form.plannedPickupAt} onChange={set("plannedPickupAt")} error={errors["plannedPickupAt"]} />
            <Input id="plannedDeliveryAt" label="Entrega estimada (ETA)" type="datetime-local" min={form.plannedPickupAt || toLocalInput(new Date().toISOString())} value={form.plannedDeliveryAt} onChange={set("plannedDeliveryAt")} error={errors["plannedDeliveryAt"]} />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input id="distanceKm" label="Distancia recorrida (km)" type="number" min="0" step="0.01"
                  value={String(form.distanceKm)} onChange={(e) => { setDistanceManual(true); setDistanceAuto(false); set("distanceKm")(e) }} />
              </div>
              <Button type="button" variant="outline" size="sm" className="mb-px shrink-0" loading={calcDistance}
                disabled={!bothCoords} onClick={computeDistance}>
                Calcular con Google
              </Button>
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">
              {distanceAuto
                ? "Calculada por carretera con Google. Puedes ajustarla a mano."
                : bothCoords
                  ? "Elige los domicilios en el mapa y se calcula sola, o usa el botón."
                  : "Captura origen y destino con Google para calcular la distancia automáticamente."}
            </p>
          </div>
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Las fechas reales se registran al marcar las tareas de recolección y entrega del tramo.
          </p>
        </section>

        <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
      </form>
    </Drawer>
  )
}
