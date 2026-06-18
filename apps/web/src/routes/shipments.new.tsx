import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AddressInput } from "@/components/ui/address-input"
import { AutotransporteSelector } from "@/components/shipments/autotransporte-selector"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { useCatalog } from "@/hooks/use-catalog"
import { collectErrors, scrollToFirstError } from "@/lib/validators"
import { useToast } from "@/components/ui/toast"

export const Route = createFileRoute("/shipments/new")({
  component: NewShipmentPage,
})

function NewShipmentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { simpleOptions: operationOptions, isLoading: opsLoading } = useCatalog("service_type")
  const { simpleOptions: transportOptions } = useCatalog("transport_mode")

  const [form, setForm] = useState({
    customerId: "", operationType: "", transportMode: "",
    origin: "", destination: "", reference: "",
    description: "", notes: "",
  })
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Con modo de transporte hay traslado físico: la ruta es obligatoria
  const hasRoute = Boolean(form.transportMode)

  const mutation = useMutation({
    mutationFn: shipmentsApi.create,
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      toast.success("Expediente creado", shipment.folio)
      navigate({ to: "/shipments/$id", params: { id: shipment.id } })
    },
    onError: (err: Error) => toast.error("No se pudo crear el expediente", err.message),
  })

  function validate() {
    // Captura progresiva: lo único obligatorio es cliente + tipo de operación.
    // La ruta y la carga se pueden completar después desde el expediente.
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
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
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

  const f = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((p) => ({ ...p, [key]: e.target.value })),
  })

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/shipments" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Expedientes
        </Link>
        <h1 className="text-2xl font-bold">Nuevo expediente</h1>
        <p className="text-sm text-[--color-muted-foreground]">
          Para abrir solo necesitas cliente y tipo de operación. El resto se completa conforme avance.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-4">
        {/* ── Apertura: lo esencial ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Apertura</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Select
              id="customerId" label="Cliente"
              placeholder="Selecciona un cliente..."
              options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
              {...f("customerId")} error={errors["customerId"]}
            />
            <Select
              id="operationType" label="Tipo de operación"
              placeholder={opsLoading ? "Cargando..." : "Selecciona..."}
              options={operationOptions}
              {...f("operationType")} error={errors["operationType"]}
            />
            <Input
              id="reference" label="Referencia (opcional)"
              placeholder="Booking, BL, número de contenedor, pedido del cliente..."
              {...f("reference")}
            />
          </CardContent>
        </Card>

        {/* ── Detalles: opcional, se completan después ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle>Detalles de la operación</CardTitle>
              <Badge variant="outline">Opcional</Badge>
            </div>
            <p className="text-sm text-[--color-muted-foreground]">
              Déjalos vacíos si aún no los tienes — se capturan después desde el expediente.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Select
              id="transportMode" label="Modo de transporte (si hay traslado)"
              placeholder="Sin traslado"
              options={transportOptions}
              {...f("transportMode")}
            />

            {hasRoute && (
              <div className="grid grid-cols-2 gap-4">
                <AddressInput
                  id="origin" label="Origen"
                  placeholder="Busca origen..."
                  value={form.origin}
                  error={errors["origin"]}
                  onChange={(val) => setForm((p) => ({ ...p, origin: val }))}
                />
                <AddressInput
                  id="destination" label="Destino"
                  placeholder="Busca destino..."
                  value={form.destination}
                  error={errors["destination"]}
                  onChange={(val) => setForm((p) => ({ ...p, destination: val }))}
                />
              </div>
            )}

            <Input
              id="description" label="Descripción del servicio (opcional)"
              placeholder="Lavado de contenedor 40', maniobras, etc. El detalle de mercancías se captura en el expediente."
              {...f("description")}
            />
            <Input id="notes" label="Notas" {...f("notes")} />

            {hasRoute && (
              <AutotransporteSelector
                vehicleId={vehicleId}
                operatorId={operatorId}
                onChange={({ vehicleId: v, operatorId: o }) => { setVehicleId(v); setOperatorId(o) }}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Link to="/shipments"><Button type="button" variant="outline">Cancelar</Button></Link>
          <Button type="submit" loading={mutation.isPending}>Crear expediente</Button>
        </div>
      </form>
    </AppLayout>
  )
}
