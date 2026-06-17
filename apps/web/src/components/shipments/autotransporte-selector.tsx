import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Select } from "@/components/ui/select"
import { suppliersApi } from "@/api/suppliers"
import { vehiclesApi } from "@/api/vehicles"
import { operatorsApi } from "@/api/operators"

interface Props {
  vehicleId: string | null
  operatorId: string | null
  defaultSupplierId?: string | null
  onChange: (next: { vehicleId: string | null; operatorId: string | null }) => void
}

// Selecciona proveedor transportista → unidad y operador AUTORIZADOS de ese proveedor.
// Lo seleccionado alimenta el complemento Carta Porte al timbrar.
export function AutotransporteSelector({ vehicleId, operatorId, defaultSupplierId, onChange }: Props) {
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "")

  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: suppliersApi.list })
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", supplierId, "authorized"],
    queryFn: () => vehiclesApi.list({ supplierId, status: "authorized", active: true }),
    enabled: !!supplierId,
  })
  const { data: operators = [] } = useQuery({
    queryKey: ["operators", supplierId, "authorized"],
    queryFn: () => operatorsApi.list({ supplierId, status: "authorized", active: true }),
    enabled: !!supplierId,
  })

  function changeSupplier(id: string) {
    setSupplierId(id)
    onChange({ vehicleId: null, operatorId: null }) // reinicia al cambiar de proveedor
  }

  return (
    <div className="rounded-md border border-[--color-border] p-3">
      <p className="mb-3 text-sm font-medium">
        Autotransporte <span className="text-[--color-muted-foreground]">(para Carta Porte)</span>
      </p>
      <div className="flex flex-col gap-4">
        <Select
          id="carrier" label="Proveedor transportista"
          placeholder="Selecciona un proveedor..."
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
          value={supplierId}
          onChange={(e) => changeSupplier(e.target.value)}
        />
        {supplierId && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="vehicle" label="Unidad (autorizada)"
              placeholder={vehicles.length ? "Selecciona una unidad..." : "Sin unidades autorizadas"}
              options={vehicles.map((v) => ({
                value: v.id,
                label: v.economicNumber ? `${v.plates} · ${v.economicNumber}` : v.plates,
              }))}
              value={vehicleId ?? ""}
              onChange={(e) => onChange({ vehicleId: e.target.value || null, operatorId })}
            />
            <Select
              id="operator" label="Operador (autorizado)"
              placeholder={operators.length ? "Selecciona un operador..." : "Sin operadores autorizados"}
              options={operators.map((o) => ({ value: o.id, label: o.name }))}
              value={operatorId ?? ""}
              onChange={(e) => onChange({ vehicleId, operatorId: e.target.value || null })}
            />
          </div>
        )}
        {supplierId && vehicles.length === 0 && operators.length === 0 && (
          <p className="text-xs text-[--color-muted-foreground]">
            Este proveedor no tiene unidades ni operadores autorizados.{" "}
            <Link to="/suppliers/$id/edit" params={{ id: supplierId }} className="text-[--color-primary] hover:underline">
              Regístralos y autorízalos
            </Link>{" "}desde el proveedor.
          </p>
        )}
      </div>
    </div>
  )
}
