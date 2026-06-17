import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddressInput } from "@/components/ui/address-input"
import { AutotransporteSelector } from "@/components/shipments/autotransporte-selector"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { useCatalog } from "@/hooks/use-catalog"
import { collectErrors } from "@/lib/validators"

export const Route = createFileRoute("/shipments/$id/edit")({
  component: EditShipmentPage,
})

function EditShipmentPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["shipments", id],
    queryFn: () => shipmentsApi.get(id),
  })
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { simpleOptions: operationOptions } = useCatalog("service_type")
  const { simpleOptions: transportOptions } = useCatalog("transport_mode")

  type FormState = {
    customerId: string; operationType: string; transportMode: string
    origin: string; destination: string; reference: string
    description: string; notes: string
  }
  const [form, setForm] = useState<FormState | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialized = form !== null
  if (shipment && !initialized) {
    setForm({
      customerId: shipment.customerId,
      operationType: shipment.operationType,
      transportMode: shipment.transportMode ?? "",
      origin: shipment.origin ?? "",
      destination: shipment.destination ?? "",
      reference: shipment.reference ?? "",
      description: shipment.cargo?.description ?? "",
      notes: shipment.notes ?? "",
    })
    setVehicleId(shipment.vehicleId)
    setOperatorId(shipment.operatorId)
  }

  const hasRoute = Boolean(form?.transportMode)

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof shipmentsApi.update>[1]) =>
      shipmentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      queryClient.invalidateQueries({ queryKey: ["shipments", id] })
      navigate({ to: "/shipments/$id", params: { id } })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  function validate() {
    if (!form) return {}
    // Captura progresiva: solo cliente + tipo de operación son obligatorios.
    const e = collectErrors({
      customerId: form.customerId ? undefined : "Selecciona un cliente",
      operationType: form.operationType ? undefined : "Selecciona el tipo de operación",
    })
    if (form.origin.trim() && form.destination.trim() &&
        form.origin.trim().toLowerCase() === form.destination.trim().toLowerCase()) {
      e["destination"] = "Destino no puede ser igual al origen"
    }
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate({
      customerId: form.customerId,
      operationType: form.operationType,
      transportMode: form.transportMode || null,
      origin: form.origin || null,
      destination: form.destination || null,
      reference: form.reference || null,
      cargo: form.description ? { description: form.description } : null,
      notes: form.notes || null,
      vehicleId,
      operatorId,
    })
  }

  const f = (key: keyof FormState) => ({
    value: form?.[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => p && ({ ...p, [key]: e.target.value })),
  })

  if (isLoading || !form) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-[--color-muted-foreground]">
          Cargando...
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <Link
          to="/shipments/$id" params={{ id }}
          className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]"
        >
          <ArrowLeft className="h-4 w-4" /> {shipment?.folio}
        </Link>
        <h1 className="text-2xl font-bold">Editar expediente</h1>
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>{shipment?.folio}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select
              id="customerId" label="Cliente"
              options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
              {...f("customerId")} error={errors["customerId"]}
            />
            <div className="grid grid-cols-2 gap-4">
              <Select
                id="operationType" label="Tipo de operación"
                options={operationOptions}
                {...f("operationType")} error={errors["operationType"]}
              />
              <Select
                id="transportMode" label="Modo de transporte (si hay traslado)"
                placeholder="Sin traslado"
                options={transportOptions}
                {...f("transportMode")}
              />
            </div>

            {hasRoute && (
              <div className="grid grid-cols-2 gap-4">
                <AddressInput
                  id="origin" label="Origen"
                  value={form.origin}
                  error={errors["origin"]}
                  onChange={(val) => setForm((p) => p && ({ ...p, origin: val }))}
                />
                <AddressInput
                  id="destination" label="Destino"
                  value={form.destination}
                  error={errors["destination"]}
                  onChange={(val) => setForm((p) => p && ({ ...p, destination: val }))}
                />
              </div>
            )}

            <Input
              id="reference" label="Referencia (opcional)"
              placeholder="Booking, BL, número de contenedor..."
              {...f("reference")}
            />
            <Input id="description" label="Descripción del servicio (opcional)" placeholder="Lavado, maniobras... El detalle de mercancías va en el expediente." {...f("description")} />
            <Input id="notes" label="Notas (opcional)" {...f("notes")} />

            {hasRoute && (
              <AutotransporteSelector
                vehicleId={vehicleId}
                operatorId={operatorId}
                defaultSupplierId={shipment?.vehicle?.supplier.id ?? null}
                onChange={({ vehicleId: v, operatorId: o }) => { setVehicleId(v); setOperatorId(o) }}
              />
            )}
            {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
            <div className="flex gap-3 pt-2">
              <Link to="/shipments/$id" params={{ id }}>
                <Button type="button" variant="outline">Cancelar</Button>
              </Link>
              <Button type="submit" loading={mutation.isPending}>Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
