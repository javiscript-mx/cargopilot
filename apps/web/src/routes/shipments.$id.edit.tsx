import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"
import { useCatalog } from "@/hooks/use-catalog"
import { collectErrors, scrollToFirstError } from "@/lib/validators"
import { useToast } from "@/components/ui/toast"
import { ensurePermission } from "@/lib/permissions"

export const Route = createFileRoute("/shipments/$id/edit")({
  beforeLoad: () => ensurePermission("shipments.write"),
  component: EditShipmentPage,
})

function EditShipmentPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["shipments", id],
    queryFn: () => shipmentsApi.get(id),
  })
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: readiness } = useQuery({ queryKey: ["readiness", id], queryFn: () => shipmentsApi.readiness(id) })
  const locked = readiness?.locked ?? false
  const { items: operationItems, simpleOptions: operationOptions } = useCatalog("service_type")

  type FormState = {
    customerId: string; operationType: string
    reference: string; description: string; notes: string
  }
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const initialized = form !== null
  if (shipment && !initialized) {
    setForm({
      customerId: shipment.customerId,
      operationType: shipment.operationType,
      reference: shipment.reference ?? "",
      description: shipment.cargo?.description ?? "",
      notes: shipment.notes ?? "",
    })
  }

  // El modo de transporte se deriva del tipo de operación; ruta/unidad/operador van por tramo.
  const transportFor = (operationType: string): string | null => {
    const item = operationItems.find((i) => i.code === operationType)
    return (item?.extra as { defaultTransport?: string } | null)?.defaultTransport ?? null
  }

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof shipmentsApi.update>[1]) =>
      shipmentsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      queryClient.invalidateQueries({ queryKey: ["shipments", id] })
      toast.success("Cambios guardados", shipment?.folio)
      navigate({ to: "/shipments/$id", params: { id } })
    },
    onError: (err: Error) => toast.error("No se pudieron guardar los cambios", err.message),
  })

  function validate() {
    if (!form) return {}
    return collectErrors({
      customerId: form.customerId ? undefined : "Selecciona un cliente",
      operationType: form.operationType ? undefined : "Selecciona el tipo de operación",
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
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
              {...f("customerId")} error={errors["customerId"]} disabled={locked}
            />
            <Select
              id="operationType" label="Tipo de operación"
              options={operationOptions}
              {...f("operationType")} error={errors["operationType"]} disabled={locked}
            />
            {locked && (
              <p className="-mt-2 text-xs text-[--color-muted-foreground]">
                Cliente y tipo de operación quedan bloqueados: el expediente ya tiene operación en curso (proceso, tramos, facturas o bitácora).
              </p>
            )}
            <Input
              id="reference" label="Referencia (opcional)"
              placeholder="Booking, BL, número de contenedor..."
              {...f("reference")}
            />
            <Input id="description" label="Descripción del servicio (opcional)" placeholder="Flete de contenedor 40', maniobras..." {...f("description")} />
            <Input id="notes" label="Notas (opcional)" {...f("notes")} />

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
