import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { customersApi } from "@/api/customers"

interface CustomerFormProps {
  open: boolean
  onClose: () => void
}

export function CustomerForm({ open, onClose }: CustomerFormProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: "", rfc: "", email: "", phone: "" })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] })
      setForm({ name: "", rfc: "", email: "", phone: "" })
      onClose()
    },
    onError: (err: Error) => {
      setErrors({ general: err.message })
    },
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
    <Dialog open={open} onClose={onClose} title="Nuevo cliente">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          id="name"
          label="Nombre / Razón social"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          error={errors["name"]}
          placeholder="Transportes Ejemplo SA de CV"
        />
        <Input
          id="rfc"
          label="RFC"
          value={form.rfc}
          onChange={(e) => setForm((f) => ({ ...f, rfc: e.target.value.toUpperCase() }))}
          error={errors["rfc"]}
          placeholder="TES010101ABC"
          maxLength={13}
        />
        <Input
          id="email"
          label="Correo electrónico (opcional)"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          error={errors["email"]}
        />
        <Input
          id="phone"
          label="Teléfono (opcional)"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        {errors["general"] && (
          <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Guardar cliente
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
