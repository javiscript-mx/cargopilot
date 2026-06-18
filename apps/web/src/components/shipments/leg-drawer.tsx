import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useCatalog } from "@/hooks/use-catalog"
import { suppliersApi } from "@/api/suppliers"
import { vehiclesApi } from "@/api/vehicles"
import { operatorsApi } from "@/api/operators"
import { processApi, type ProcessLeg, type LegLocation, type LegPatch } from "@/api/process"

const LEG_STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "in_progress", label: "En progreso" },
  { value: "done", label: "Completado" },
  { value: "cancelled", label: "Cancelado" },
]

// datetime-local <-> ISO respetando zona horaria local
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const toISO = (local: string): string | null => (local ? new Date(local).toISOString() : null)

const asLoc = (v: Record<string, unknown> | null): LegLocation => (v ?? {}) as LegLocation

export function LegDrawer({
  open, onClose, shipmentId, leg,
}: { open: boolean; onClose: () => void; shipmentId: string; leg: ProcessLeg }) {
  const queryClient = useQueryClient()
  const toast = useToast()

  // Transportistas: proveedores de un tipo marcado autotransporte (Carta Porte)
  const { items: supplierTypes } = useCatalog("supplier_type")
  const carrierTypes = useMemo(
    () => new Set(supplierTypes.filter((t) => (t.extra as { autotransporte?: boolean } | null)?.autotransporte).map((t) => t.code)),
    [supplierTypes],
  )
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersApi.list() })
  const carriers = suppliers.filter((s) => s.active && carrierTypes.has(s.type))

  const o = asLoc(leg.origin)
  const d = asLoc(leg.destination)
  const [form, setForm] = useState({
    status: leg.status,
    carrierSupplierId: leg.carrierSupplierId ?? "",
    vehicleId: leg.vehicleId ?? "",
    operatorId: leg.operatorId ?? "",
    originName: o.name ?? "", originRfc: o.rfc ?? "", originZip: o.zip ?? "", originAddress: o.address ?? "",
    destName: d.name ?? "", destRfc: d.rfc ?? "", destZip: d.zip ?? "", destAddress: d.address ?? "",
    distanceKm: leg.distanceKm ?? "",
    plannedPickupAt: toLocalInput(leg.plannedPickupAt),
    actualPickupAt: toLocalInput(leg.actualPickupAt),
    plannedDeliveryAt: toLocalInput(leg.plannedDeliveryAt),
    actualDeliveryAt: toLocalInput(leg.actualDeliveryAt),
    notes: leg.notes ?? "",
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Unidades y operadores del transportista seleccionado
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", form.carrierSupplierId],
    queryFn: () => vehiclesApi.list({ supplierId: form.carrierSupplierId, active: true }),
    enabled: Boolean(form.carrierSupplierId),
  })
  const { data: operators = [] } = useQuery({
    queryKey: ["operators", form.carrierSupplierId],
    queryFn: () => operatorsApi.list({ supplierId: form.carrierSupplierId, active: true }),
    enabled: Boolean(form.carrierSupplierId),
  })

  // Al cambiar transportista, limpia unidad/operador (pertenecen al anterior)
  const onCarrierChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, carrierSupplierId: e.target.value, vehicleId: "", operatorId: "" }))

  const loc = (name: string, rfc: string, zip: string, address: string): LegLocation | null => {
    const v: LegLocation = {}
    if (name.trim()) v.name = name.trim()
    if (rfc.trim()) v.rfc = rfc.trim().toUpperCase()
    if (zip.trim()) v.zip = zip.trim()
    if (address.trim()) v.address = address.trim()
    return Object.keys(v).length ? v : null
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: LegPatch = {
        status: form.status,
        carrierSupplierId: form.carrierSupplierId || null,
        vehicleId: form.vehicleId || null,
        operatorId: form.operatorId || null,
        origin: loc(form.originName, form.originRfc, form.originZip, form.originAddress),
        destination: loc(form.destName, form.destRfc, form.destZip, form.destAddress),
        distanceKm: form.distanceKm ? Number(form.distanceKm) : null,
        plannedPickupAt: toISO(form.plannedPickupAt),
        actualPickupAt: toISO(form.actualPickupAt),
        plannedDeliveryAt: toISO(form.plannedDeliveryAt),
        actualDeliveryAt: toISO(form.actualDeliveryAt),
        notes: form.notes.trim() || null,
      }
      return processApi.updateLeg(leg.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] })
      toast.success("Tramo actualizado")
      onClose()
    },
    onError: (err: Error) => toast.error("No se pudo guardar el tramo", err.message),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate()
  }

  const foraneo = leg.scope === "foraneo"

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Tramo ${leg.order} · ${foraneo ? "Foráneo" : "Local"}`}
      description={foraneo ? "Datos de autotransporte y ubicaciones para la Carta Porte." : "Datos de autotransporte del tramo local."}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="leg-form" size="sm" loading={saveMutation.isPending}>Guardar cambios</Button>
        </div>
      }
    >
      <form id="leg-form" onSubmit={handleSave} className="flex flex-col gap-4">
        <Select id="status" label="Estado del tramo" options={LEG_STATUS_OPTIONS} value={form.status} onChange={set("status")} />

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Autotransporte</h4>
          <Select
            id="carrier" label="Transportista"
            placeholder={carriers.length ? "Selecciona..." : "Sin transportistas (marca el tipo como autotransporte)"}
            options={carriers.map((c) => ({ value: c.id, label: c.name }))}
            value={form.carrierSupplierId} onChange={onCarrierChange}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              id="vehicle" label="Unidad"
              placeholder={form.carrierSupplierId ? "Selecciona..." : "Elige transportista"}
              options={vehicles.map((v) => ({ value: v.id, label: v.economicNumber ? `${v.plates} · ${v.economicNumber}` : v.plates }))}
              value={form.vehicleId} onChange={set("vehicleId")}
            />
            <Select
              id="operator" label="Operador"
              placeholder={form.carrierSupplierId ? "Selecciona..." : "Elige transportista"}
              options={operators.map((op) => ({ value: op.id, label: op.name }))}
              value={form.operatorId} onChange={set("operatorId")}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Origen</h4>
          <Input id="originName" label="Nombre / razón social" value={form.originName} onChange={set("originName")} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="originRfc" label="RFC" value={form.originRfc} onChange={set("originRfc")} maxLength={13} />
            <Input id="originZip" label="Código postal" value={form.originZip} onChange={set("originZip")} maxLength={5} />
          </div>
          <Input id="originAddress" label="Domicilio" value={form.originAddress} onChange={set("originAddress")} />
        </section>

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Destino</h4>
          <Input id="destName" label="Nombre / razón social" value={form.destName} onChange={set("destName")} />
          <div className="grid grid-cols-2 gap-3">
            <Input id="destRfc" label="RFC" value={form.destRfc} onChange={set("destRfc")} maxLength={13} />
            <Input id="destZip" label="Código postal" value={form.destZip} onChange={set("destZip")} maxLength={5} />
          </div>
          <Input id="destAddress" label="Domicilio" value={form.destAddress} onChange={set("destAddress")} />
        </section>

        <Input
          id="distanceKm" label="Distancia recorrida (km)" type="number" min="0" step="0.01"
          value={String(form.distanceKm)} onChange={set("distanceKm")}
        />

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Fechas</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input id="plannedPickupAt" label="Recolección planeada" type="datetime-local" value={form.plannedPickupAt} onChange={set("plannedPickupAt")} />
            <Input id="actualPickupAt" label="Recolección real" type="datetime-local" value={form.actualPickupAt} onChange={set("actualPickupAt")} />
            <Input id="plannedDeliveryAt" label="Entrega planeada" type="datetime-local" value={form.plannedDeliveryAt} onChange={set("plannedDeliveryAt")} />
            <Input id="actualDeliveryAt" label="Entrega real" type="datetime-local" value={form.actualDeliveryAt} onChange={set("actualDeliveryAt")} />
          </div>
        </section>

        <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
      </form>
    </Drawer>
  )
}
