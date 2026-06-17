import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddressInput, type AddressValue } from "@/components/ui/address-input"
import { customersApi } from "@/api/customers"
import { DocumentsSection } from "@/components/ui/documents-section"
import { REGIMEN_FISCAL_OPTIONS } from "@/lib/sat-catalogs"
import { validateRfc, validateEmail, validatePhone, validateRequired, validateCp, collectErrors } from "@/lib/validators"

export const Route = createFileRoute("/customers/$id/edit")({
  component: EditCustomerPage,
})

function EditCustomerPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: () => customersApi.get(id),
  })

  const [form, setForm] = useState<{
    name: string; rfc: string; email: string; phone: string; address: string
    fiscalRegime: string; fiscalZipCode: string
  } | null>(null)
  const [addressDetail, setAddressDetail] = useState<AddressValue | undefined>()
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize form once customer loads
  const initialized = form !== null
  if (customer && !initialized) {
    const addr = customer.address as { formatted?: string } | null
    setForm({
      name: customer.name,
      rfc: customer.rfc,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: addr?.formatted ?? "",
      fiscalRegime: customer.fiscalRegime ?? "",
      fiscalZipCode: customer.fiscalZipCode ?? "",
    })
  }

  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof customersApi.update>[1]) =>
      customersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] })
      queryClient.invalidateQueries({ queryKey: ["customers", id] })
      navigate({ to: "/customers" })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  function validate() {
    if (!form) return {}
    return collectErrors({
      name: validateRequired(form.name, "Nombre"),
      rfc: validateRfc(form.rfc),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      fiscalZipCode: validateCp(form.fiscalZipCode),
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate({
      name: form.name,
      rfc: form.rfc.toUpperCase(),
      email: form.email || null,
      phone: form.phone || null,
      address: addressDetail ?? (form.address ? { formatted: form.address } : null),
      fiscalRegime: form.fiscalRegime || null,
      fiscalZipCode: form.fiscalZipCode || null,
    })
  }

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
        <Link to="/customers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <h1 className="text-2xl font-bold">Editar cliente</h1>
      </div>

      <div className="flex max-w-lg flex-col gap-4">
      <Card>
        <CardHeader><CardTitle>{customer?.name}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="name" label="Nombre / Razón social"
              value={form.name} onChange={(e) => setForm((f) => f && ({ ...f, name: e.target.value }))}
              error={errors["name"]}
            />
            <Input
              id="rfc" label="RFC"
              value={form.rfc} onChange={(e) => setForm((f) => f && ({ ...f, rfc: e.target.value.toUpperCase() }))}
              error={errors["rfc"]} maxLength={13}
            />
            <Input
              id="email" label="Correo electrónico (opcional)" type="email"
              value={form.email} onChange={(e) => setForm((f) => f && ({ ...f, email: e.target.value }))}
              error={errors["email"]}
            />
            <Input
              id="phone" label="Teléfono (opcional)"
              value={form.phone} onChange={(e) => setForm((f) => f && ({ ...f, phone: e.target.value }))}
              error={errors["phone"]}
            />
            <AddressInput
              id="address" label="Dirección (opcional)"
              value={form.address}
              onChange={(formatted, detail) => {
                setForm((f) => f && ({ ...f, address: formatted }))
                setAddressDetail(detail)
              }}
            />

            <div className="rounded-md border border-[--color-border] p-3">
              <p className="mb-3 text-sm font-medium">Datos fiscales <span className="text-[--color-muted-foreground]">(para timbrar CFDI)</span></p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  id="fiscalRegime" label="Régimen fiscal"
                  placeholder="Selecciona..."
                  options={REGIMEN_FISCAL_OPTIONS}
                  value={form.fiscalRegime}
                  onChange={(e) => setForm((f) => f && ({ ...f, fiscalRegime: e.target.value }))}
                />
                <Input
                  id="fiscalZipCode" label="CP fiscal"
                  value={form.fiscalZipCode}
                  onChange={(e) => setForm((f) => f && ({ ...f, fiscalZipCode: e.target.value }))}
                  error={errors["fiscalZipCode"]} placeholder="06600" maxLength={5}
                />
              </div>
            </div>
            {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
            <div className="flex gap-3 pt-2">
              <Link to="/customers"><Button type="button" variant="outline">Cancelar</Button></Link>
              <Button type="submit" loading={mutation.isPending}>Guardar cambios</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DocumentsSection entityType="customer" entityId={id} />
      </div>
    </AppLayout>
  )
}
