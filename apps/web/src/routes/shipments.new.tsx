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
  const { items: operationItems, simpleOptions: operationOptions, isLoading: opsLoading } = useCatalog("service_type")

  const [form, setForm] = useState({
    customerId: "", operationType: "",
    reference: "", description: "", notes: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // El modo de transporte se deriva del tipo de operación (extra.defaultTransport).
  // La ruta, unidad y operador se capturan por tramo en la sección Proceso.
  const transportFor = (operationType: string): string | null => {
    const item = operationItems.find((i) => i.code === operationType)
    return (item?.extra as { defaultTransport?: string } | null)?.defaultTransport ?? null
  }

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
    return collectErrors({
      customerId: form.customerId ? undefined : "Selecciona un cliente",
      operationType: form.operationType ? undefined : "Selecciona el tipo de operación",
    })
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
      transportMode: transportFor(form.operationType),
      reference: form.reference || null,
      cargo: form.description ? { description: form.description } : null,
      notes: form.notes || null,
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
          Para abrir solo necesitas cliente y tipo de operación. La ruta y el transporte se capturan por tramo en el proceso.
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

        {/* ── Servicio: opcional ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle>Servicio</CardTitle>
              <Badge variant="outline">Opcional</Badge>
            </div>
            <p className="text-sm text-[--color-muted-foreground]">
              Descripción general. Tramos, mercancías y transporte se capturan después en el expediente.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              id="description" label="Descripción del servicio (opcional)"
              placeholder="Flete de contenedor 40', maniobras, etc."
              {...f("description")}
            />
            <Input id="notes" label="Notas" {...f("notes")} />
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
