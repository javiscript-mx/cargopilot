import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { shipmentsApi } from "@/api/shipments"
import { customersApi } from "@/api/customers"

interface ShipmentFormProps {
  open: boolean
  onClose: () => void
}

export function ShipmentForm({ open, onClose }: ShipmentFormProps) {
  const queryClient = useQueryClient()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })

  const [form, setForm] = useState({
    customerId: "",
    origin: "",
    destination: "",
    description: "",
    weight: "",
    units: "",
    notes: "",
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: shipmentsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
      setForm({ customerId: "", origin: "", destination: "", description: "", weight: "", units: "", notes: "" })
      onClose()
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
      setForm((prev) => ({ ...prev, [key]: e.target.value })),
  })

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo expediente" className="max-w-2xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          id="customerId"
          label="Cliente"
          placeholder="Selecciona un cliente..."
          options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
          {...f("customerId")}
          error={errors["customerId"]}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input id="origin" label="Origen" placeholder="Ciudad de México" {...f("origin")} error={errors["origin"]} />
          <Input id="destination" label="Destino" placeholder="Guadalajara, Jalisco" {...f("destination")} error={errors["destination"]} />
        </div>
        <Input id="description" label="Descripción de la carga" placeholder="Mercancía general" {...f("description")} error={errors["description"]} />
        <div className="grid grid-cols-2 gap-4">
          <Input id="weight" label="Peso (kg, opcional)" type="number" min="0" step="0.01" {...f("weight")} />
          <Input id="units" label="Unidades (opcional)" type="number" min="1" step="1" {...f("units")} />
        </div>
        <Input id="notes" label="Notas (opcional)" {...f("notes")} />
        {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Crear expediente</Button>
        </div>
      </form>
    </Dialog>
  )
}
