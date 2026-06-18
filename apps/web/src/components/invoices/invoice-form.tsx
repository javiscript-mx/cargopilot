import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { invoicesApi } from "@/api/invoices"
import { customersApi } from "@/api/customers"
import { shipmentsApi } from "@/api/shipments"
import { useToast } from "@/components/ui/toast"

interface InvoiceFormProps {
  open: boolean
  onClose: () => void
}

const CFDI_USES = [
  { value: "G01", label: "G01 - Adquisición de mercancias" },
  { value: "G03", label: "G03 - Gastos en general" },
  { value: "S01", label: "S01 - Sin efectos fiscales" },
  { value: "CP01", label: "CP01 - Pagos" },
]

const PAYMENT_FORMS = [
  { value: "01", label: "01 - Efectivo" },
  { value: "03", label: "03 - Transferencia electrónica" },
  { value: "04", label: "04 - Tarjeta de crédito" },
  { value: "28", label: "28 - Tarjeta de débito" },
  { value: "99", label: "99 - Por definir" },
]

interface LineItem {
  description: string
  quantity: string
  unitPrice: string
  productCode: string
  unitCode: string
}

const emptyItem = (): LineItem => ({
  description: "",
  quantity: "1",
  unitPrice: "",
  productCode: "78101800",
  unitCode: "E48",
})

export function InvoiceForm({ open, onClose }: InvoiceFormProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments"], queryFn: shipmentsApi.list })

  const [customerId, setCustomerId] = useState("")
  const [shipmentId, setShipmentId] = useState("")
  const [cfdiUse, setCfdiUse] = useState("G03")
  const [paymentForm, setPaymentForm] = useState("03")
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Factura borrador creada")
      resetForm()
      onClose()
    },
    onError: (err: Error) => toast.error("No se pudo crear la factura", err.message),
  })

  function resetForm() {
    setCustomerId(""); setShipmentId(""); setCfdiUse("G03"); setPaymentForm("03")
    setItems([emptyItem()]); setErrors({})
  }

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!customerId) e["customerId"] = "Selecciona un cliente"
    items.forEach((item, i) => {
      if (!item.description.trim()) e[`item_${i}_desc`] = "Requerido"
      if (!item.quantity || parseFloat(item.quantity) <= 0) e[`item_${i}_qty`] = "Inválido"
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) e[`item_${i}_price`] = "Inválido"
    })
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      return
    }
    setErrors({})
    mutation.mutate({
      customerId,
      ...(shipmentId ? { shipmentId } : {}),
      cfdiUse,
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        productCode: item.productCode || "78101800",
        unitCode: item.unitCode || "E48",
      })),
    })
  }

  const subtotal = items.reduce((acc, item) => {
    const q = parseFloat(item.quantity) || 0
    const p = parseFloat(item.unitPrice) || 0
    return acc + q * p
  }, 0)
  const tax = subtotal * 0.16
  const total = subtotal + tax

  const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`

  const customerShipments = shipments.filter((s) => s.customer.id === customerId && !["cancelled"].includes(s.status))

  return (
    <Dialog open={open} onClose={onClose} title="Nueva factura" className="max-w-3xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Select
            id="customerId"
            label="Cliente"
            placeholder="Selecciona un cliente..."
            options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setShipmentId("") }}
            error={errors["customerId"]}
          />
          <Select
            id="shipmentId"
            label="Expediente (opcional)"
            placeholder="Sin expediente"
            options={customerShipments.map((s) => ({ value: s.id, label: `${s.folio} — ${s.origin} → ${s.destination}` }))}
            value={shipmentId}
            onChange={(e) => setShipmentId(e.target.value)}
            disabled={!customerId}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Select
            id="cfdiUse"
            label="Uso CFDI"
            options={CFDI_USES}
            value={cfdiUse}
            onChange={(e) => setCfdiUse(e.target.value)}
          />
          <Select
            id="paymentForm"
            label="Forma de pago"
            options={PAYMENT_FORMS}
            value={paymentForm}
            onChange={(e) => setPaymentForm(e.target.value)}
          />
        </div>

        {/* Conceptos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Conceptos</p>
            <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
              <Plus className="h-3 w-3" /> Agregar
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-start">
                <Input
                  placeholder="Descripción del servicio"
                  value={item.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  error={errors[`item_${idx}_desc`]}
                />
                <Input
                  placeholder="Cant."
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  error={errors[`item_${idx}_qty`]}
                />
                <Input
                  placeholder="Precio"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                  error={errors[`item_${idx}_price`]}
                />
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  className="mt-1 h-8 w-8 flex items-center justify-center rounded hover:bg-red-50 text-[--color-muted-foreground] hover:text-[--color-destructive] disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Totales */}
        <div className="rounded-md bg-[--color-muted] p-3 text-sm">
          <div className="flex justify-between text-[--color-muted-foreground]">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[--color-muted-foreground]">
            <span>IVA 16%</span><span>{fmt(tax)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-[--color-border] pt-1 font-semibold">
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Crear factura borrador</Button>
        </div>
      </form>
    </Dialog>
  )
}
