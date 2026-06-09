import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { Link } from "@tanstack/react-router"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { customersApi } from "@/api/customers"

export const Route = createFileRoute("/customers/new")({
  component: NewCustomerPage,
})

function NewCustomerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: "", rfc: "", email: "", phone: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] })
      navigate({ to: "/customers" })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  function validate() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e["name"] = "Requerido"
    if (!form.rfc.trim()) e["rfc"] = "Requerido"
    if (form.rfc.length < 12 || form.rfc.length > 13) e["rfc"] = "RFC inválido (12-13 caracteres)"
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e["email"] = "Correo inválido"
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate({
      name: form.name,
      rfc: form.rfc.toUpperCase(),
      email: form.email || null,
      phone: form.phone || null,
    })
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/customers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      </div>

      <Card className="max-w-lg">
        <CardHeader><CardTitle>Datos del cliente</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="name" label="Nombre / Razón social"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={errors["name"]} placeholder="Transportes Ejemplo SA de CV"
            />
            <Input
              id="rfc" label="RFC"
              value={form.rfc} onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
              error={errors["rfc"]} placeholder="TES010101ABC" maxLength={13}
            />
            <Input
              id="email" label="Correo electrónico (opcional)" type="email"
              value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              error={errors["email"]}
            />
            <Input
              id="phone" label="Teléfono (opcional)"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
            <div className="flex gap-3 pt-2">
              <Link to="/customers"><Button type="button" variant="outline">Cancelar</Button></Link>
              <Button type="submit" loading={mutation.isPending}>Guardar cliente</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </AppLayout>
  )
}
