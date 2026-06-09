import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"

export const Route = createFileRoute("/shipments/new")({
  component: NewShipmentPage,
})

function NewShipmentPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })

  const [form, setForm] = useState({
    customerId: "", origin: "", destination: "",
    description: "", weight: "", units: "", notes: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: shipmentsApi.create,
    onSuccess: (shipment) => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      navigate({ to: "/shipments/$id", params: { id: shipment.id } })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  function validate() {
    const e: Record<string, string> = {}
    if (!form.customerId) e["customerId"] = "Selecciona un cliente"
    if (!form.origin.trim()) e["origin"] = "Requerido"
    if (!form.destination.trim()) e["destination"] = "Requerido"
    if (!form.description.trim()) e["description"] = "Requerido"
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate({
      customerId: form.customerId,
      origin: form.origin,
      destination: form.destination,
      cargo: {
        description: form.description,
        ...(form.weight ? { weight: parseFloat(form.weight) } : {}),
        ...(form.units ? { units: parseInt(form.units) } : {}),
      },
      ...(form.notes ? { notes: form.notes } : {}),
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
      </div>

      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Datos del envío</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Select
              id="customerId" label="Cliente"
              placeholder="Selecciona un cliente..."
              options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
              {...f("customerId")} error={errors["customerId"]}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input id="origin" label="Origen" placeholder="Ciudad de México" {...f("origin")} error={errors["origin"]} />
              <Input id="destination" label="Destino" placeholder="Guadalajara, Jalisco" {...f("destination")} error={errors["destination"]} />
            </div>
            <Input id="description" label="Descripción de la carga" placeholder="Mercancía general" {...f("description")} error={errors["description"]} />
            <div className="grid grid-cols-2 gap-4">
              <Input id="weight" label="Peso (kg, opcional)" type="number" min="0" step="0.01" {...f("weight")} />
              <Input id="units" label="Unidades (opcional)" type="number" min="1" {...f("units")} />
            </div>
            <Input id="notes" label="Notas (opcional)" {...f("notes")} />
            {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
            <div className="flex gap-3 pt-2">
              <Link to="/shipments"><Button type="button" variant="outline">Cancelar</Button></Link>
              <Button type="submit" loading={mutation.isPending}>Crear expediente</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
