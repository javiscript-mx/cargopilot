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
import { processApi, type LegVehicleAssignment, type LegVehiclePatch } from "@/api/process"
import { collectErrors, scrollToFirstError } from "@/lib/validators"

// Alta / edición de una unidad de transporte de un tramo.
// `vehicle === null` ⇒ alta; en otro caso edición.
export function LegVehicleDrawer({
  open, onClose, shipmentId, legId, vehicle, index,
}: {
  open: boolean; onClose: () => void; shipmentId: string; legId: string
  vehicle: LegVehicleAssignment | null; index: number
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  // Transportistas: proveedores de un tipo marcado autotransporte (Carta Porte)
  const { items: supplierTypes } = useCatalog("supplier_type")
  const { options: trailerTypeOptions } = useCatalog("cp_subtipo_remolque")
  const carrierTypes = useMemo(
    () => new Set(supplierTypes.filter((t) => (t.extra as { autotransporte?: boolean } | null)?.autotransporte).map((t) => t.code)),
    [supplierTypes],
  )
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: () => suppliersApi.list() })
  const carriers = suppliers.filter((s) => s.active && carrierTypes.has(s.type))

  const [form, setForm] = useState({
    carrierSupplierId: vehicle?.carrierSupplierId ?? "",
    vehicleId: vehicle?.vehicleId ?? "",
    operatorId: vehicle?.operatorId ?? "",
    trailer1Plate: vehicle?.trailer1Plate ?? "", trailer1Type: vehicle?.trailer1Type ?? "",
    trailer2Plate: vehicle?.trailer2Plate ?? "", trailer2Type: vehicle?.trailer2Type ?? "",
    notes: vehicle?.notes ?? "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Solo unidades/operadores AUTORIZADOS (el backend igual lo valida; aquí evitamos
  // que el usuario siquiera vea opciones no aptas para Carta Porte).
  const { data: allVehicles = [] } = useQuery({
    queryKey: ["vehicles", form.carrierSupplierId],
    queryFn: () => vehiclesApi.list({ supplierId: form.carrierSupplierId, active: true }),
    enabled: Boolean(form.carrierSupplierId),
  })
  const { data: allOperators = [] } = useQuery({
    queryKey: ["operators", form.carrierSupplierId],
    queryFn: () => operatorsApi.list({ supplierId: form.carrierSupplierId, active: true }),
    enabled: Boolean(form.carrierSupplierId),
  })
  const vehicles = allVehicles.filter((v) => v.status === "authorized")
  const operators = allOperators.filter((o) => o.status === "authorized")
  const hiddenCount = (allVehicles.length - vehicles.length) + (allOperators.length - operators.length)

  const onCarrierChange = (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm((f) => ({ ...f, carrierSupplierId: e.target.value, vehicleId: "", operatorId: "" }))

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: LegVehiclePatch = {
        carrierSupplierId: form.carrierSupplierId || null,
        vehicleId: form.vehicleId || null,
        operatorId: form.operatorId || null,
        trailer1Plate: form.trailer1Plate.trim().toUpperCase() || null,
        trailer1Type: form.trailer1Type || null,
        trailer2Plate: form.trailer2Plate.trim().toUpperCase() || null,
        trailer2Type: form.trailer2Type || null,
        notes: form.notes.trim() || null,
      }
      return vehicle ? processApi.updateVehicle(vehicle.id, payload) : processApi.addVehicle(legId, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      toast.success(vehicle ? "Unidad actualizada" : "Unidad agregada")
      onClose()
    },
    onError: (err: Error) => toast.error("No se pudo guardar la unidad", err.message),
  })

  const trailerOpts = trailerTypeOptions.length
    ? trailerTypeOptions
    : [{ value: "CTR004", label: "CTR004 - Caja seca" }, { value: "CTR031", label: "CTR031 - Plataforma" }]

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={vehicle ? `Unidad ${index}` : "Nueva unidad"}
      description="Transportista, unidad motriz, operador y remolques. Cada unidad foránea genera su propio CFDI Carta Porte."
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="leg-vehicle-form" size="sm" loading={saveMutation.isPending}>
            {vehicle ? "Guardar cambios" : "Agregar unidad"}
          </Button>
        </div>
      }
    >
      <form id="leg-vehicle-form" onSubmit={(e) => {
        e.preventDefault()
        const errs = collectErrors({
          carrier: form.carrierSupplierId ? undefined : "Selecciona el transportista",
          vehicle: form.vehicleId ? undefined : "Selecciona la unidad motriz",
          operator: form.operatorId ? undefined : "Selecciona el operador",
        })
        if (Object.keys(errs).length) {
          setErrors(errs)
          toast.error("Faltan datos de la unidad", "Selecciona transportista, unidad motriz y operador.")
          scrollToFirstError()
          return
        }
        setErrors({})
        saveMutation.mutate()
      }} className="flex flex-col gap-4">
        <Select
          id="carrier" label="Transportista"
          placeholder={carriers.length ? "Selecciona..." : "Sin transportistas (marca el tipo como autotransporte)"}
          options={carriers.map((c) => ({ value: c.id, label: c.name }))}
          value={form.carrierSupplierId} onChange={onCarrierChange} error={errors.carrier}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            id="vehicle" label="Unidad motriz"
            placeholder={form.carrierSupplierId ? "Selecciona..." : "Elige transportista"}
            options={vehicles.map((v) => ({ value: v.id, label: v.economicNumber ? `${v.plates} · ${v.economicNumber}` : v.plates }))}
            value={form.vehicleId} onChange={set("vehicleId")} error={errors.vehicle}
          />
          <Select
            id="operator" label="Operador"
            placeholder={form.carrierSupplierId ? "Selecciona..." : "Elige transportista"}
            options={operators.map((op) => ({ value: op.id, label: op.name }))}
            value={form.operatorId} onChange={set("operatorId")} error={errors.operator}
          />
        </div>
        {form.carrierSupplierId && hiddenCount > 0 && (
          <p className="-mt-2 text-xs text-[--color-muted-foreground]">
            {hiddenCount} unidad(es)/operador(es) ocultos por no estar autorizados. Autorízalos en el proveedor.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold">Remolques (para configuración full / doble)</h4>
          <div className="grid grid-cols-2 gap-3">
            <Input id="trailer1Plate" label="Remolque 1 · placa" value={form.trailer1Plate} onChange={set("trailer1Plate")} maxLength={10} />
            <Select id="trailer1Type" label="Remolque 1 · subtipo" placeholder="—" options={trailerOpts} value={form.trailer1Type} onChange={set("trailer1Type")} />
            <Input id="trailer2Plate" label="Remolque 2 · placa" value={form.trailer2Plate} onChange={set("trailer2Plate")} maxLength={10} />
            <Select id="trailer2Type" label="Remolque 2 · subtipo" placeholder="—" options={trailerOpts} value={form.trailer2Type} onChange={set("trailer2Type")} />
          </div>
        </section>

        <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
      </form>
    </Drawer>
  )
}
