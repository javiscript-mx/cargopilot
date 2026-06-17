import { useState } from "react"
import { useNavigate, Link } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { AddressInput, type AddressValue } from "@/components/ui/address-input"
import { suppliersApi, type Supplier, type CreateSupplierInput } from "@/api/suppliers"
import { documentsApi } from "@/api/documents"
import { PendingFilesPicker } from "@/components/ui/documents-section"
import { useCatalog } from "@/hooks/use-catalog"
import { validateRfc, validateEmail, validatePhone, validateRequired, collectErrors } from "@/lib/validators"

const EMPTY_FORM = {
  name: "", type: "carrier" as Supplier["type"],
  rfc: "", email: "", phone: "", contact: "", notes: "", address: "",
}

interface Props {
  mode: "create" | "edit"
  supplier?: Supplier
}

export function SupplierForm({ mode, supplier }: Props) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { simpleOptions: typeOptions, isLoading: typesLoading } = useCatalog("supplier_type")

  const [form, setForm] = useState(
    supplier
      ? {
          name: supplier.name,
          type: supplier.type,
          rfc: supplier.rfc ?? "",
          email: supplier.email ?? "",
          phone: supplier.phone ?? "",
          contact: supplier.contact ?? "",
          notes: supplier.notes ?? "",
          address: (supplier.address as { formatted?: string } | null)?.formatted ?? "",
        }
      : EMPTY_FORM,
  )
  const [addressDetail, setAddressDetail] = useState<AddressValue | undefined>()
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createMutation = useMutation({
    mutationFn: suppliersApi.create,
    onSuccess: async (created) => {
      const failed: string[] = []
      for (const file of pendingFiles) {
        try {
          await documentsApi.upload("supplier", created.id, file)
        } catch {
          failed.push(file.name)
        }
      }
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      if (failed.length) {
        alert(`Proveedor creado, pero fallaron estos archivos: ${failed.join(", ")}. Puedes reintentarlo desde Editar.`)
      }
      navigate({ to: "/suppliers" })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CreateSupplierInput>) =>
      suppliersApi.update(supplier!.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      queryClient.invalidateQueries({ queryKey: ["suppliers", supplier!.id] })
      navigate({ to: "/suppliers/$id", params: { id: supplier!.id } })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function validate() {
    return collectErrors({
      name: validateRequired(form.name, "Nombre"),
      type: form.type ? undefined : "Selecciona un tipo",
      rfc: validateRfc(form.rfc, { required: false }),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})

    const data: CreateSupplierInput = {
      name: form.name,
      type: form.type,
      rfc: form.rfc.toUpperCase() || null,
      email: form.email || null,
      phone: form.phone || null,
      contact: form.contact || null,
      notes: form.notes || null,
      address: addressDetail ?? (form.address ? { formatted: form.address } : null),
      active: supplier?.active ?? true,
    }

    if (mode === "create") createMutation.mutate(data)
    else updateMutation.mutate(data)
  }

  const s = (key: keyof typeof form) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/suppliers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Proveedores
        </Link>
        <h1 className="text-2xl font-bold">
          {mode === "create" ? "Nuevo proveedor" : "Editar proveedor"}
        </h1>
      </div>

      <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{mode === "edit" ? supplier?.name : "Datos del proveedor"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input id="name" label="Nombre" {...s("name")} error={errors["name"]} className="col-span-2 sm:col-span-1" />
              <Select
                id="type" label="Tipo"
                options={typeOptions}
                placeholder={typesLoading ? "Cargando..." : "Selecciona un tipo"}
                {...s("type")}
                error={errors["type"]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input id="rfc" label="RFC (opcional)" {...s("rfc")}
                onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                error={errors["rfc"]} maxLength={13} placeholder="ABC010101XYZ"
              />
              <Input id="contact" label="Persona de contacto (opcional)" {...s("contact")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input id="phone" label="Teléfono (opcional)" {...s("phone")} error={errors["phone"]} />
              <Input id="email" label="Correo (opcional)" type="email" {...s("email")} error={errors["email"]} />
            </div>
            <AddressInput
              id="address" label="Dirección (opcional)"
              value={form.address}
              onChange={(formatted, detail) => {
                setForm((f) => ({ ...f, address: formatted }))
                setAddressDetail(detail)
              }}
            />
            <Input id="notes" label="Notas (opcional)" {...s("notes")} />

            {mode === "create" && (
              <PendingFilesPicker files={pendingFiles} onChange={setPendingFiles} disabled={isPending} />
            )}

            {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}
            <div className="flex gap-3 pt-2">
              {mode === "edit" && supplier ? (
                <Link to="/suppliers/$id" params={{ id: supplier.id }}>
                  <Button type="button" variant="outline">Cancelar</Button>
                </Link>
              ) : (
                <Link to="/suppliers">
                  <Button type="button" variant="outline">Cancelar</Button>
                </Link>
              )}
              <Button type="submit" loading={isPending}>
                {mode === "create" ? "Crear proveedor" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  )
}
