import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { invoicesApi } from "@/api/invoices"
import { customersApi } from "@/api/customers"
import { shipmentsApi } from "@/api/shipments"
import { validateRequired, validateQuantity, validateUnitPrice } from "@/lib/validators"

export const Route = createFileRoute("/invoices/new")({
  component: NewInvoicePage,
})

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

const PAYMENT_METHODS = [
  { value: "PUE", label: "PUE - Pago en una sola exhibición" },
  { value: "PPD", label: "PPD - Pago en parcialidades o diferido" },
]

interface LineItem { description: string; quantity: string; unitPrice: string; productCode: string; unitCode: string }
const emptyItem = (): LineItem => ({ description: "", quantity: "1", unitPrice: "", productCode: "78101800", unitCode: "E48" })

function NewInvoicePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments"], queryFn: shipmentsApi.list })

  const [customerId, setCustomerId] = useState("")
  const [shipmentId, setShipmentId] = useState("")
  const [cfdiUse, setCfdiUse] = useState("G03")
  const [paymentForm, setPaymentForm] = useState("03")
  const [paymentMethod, setPaymentMethod] = useState("PUE")
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      navigate({ to: "/invoices" })
    },
    onError: (err: Error) => setErrors({ general: err.message }),
  })

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)))
  }

  function validate() {
    const e: Record<string, string> = {}
    if (!customerId) e["customerId"] = "Selecciona un cliente"
    items.forEach((item, i) => {
      const desc = validateRequired(item.description, "Descripción")
      if (desc) e[`item_${i}_desc`] = desc
      const qty = validateQuantity(item.quantity)
      if (qty) e[`item_${i}_qty`] = qty
      const price = validateUnitPrice(item.unitPrice)
      if (price) e[`item_${i}_price`] = price
    })
    // El SAT rechaza CFDI con total en cero
    const total = items.reduce((acc, it) => acc + (parseFloat(it.quantity) || 0) * (parseFloat(it.unitPrice) || 0), 0)
    if (!Object.keys(e).length && total <= 0) e["general"] = "El total de la factura debe ser mayor a cero"
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate({
      customerId,
      ...(shipmentId ? { shipmentId } : {}),
      cfdiUse,
      paymentForm,
      paymentMethod,
      items: items.map((item) => ({
        description: item.description,
        quantity: parseFloat(item.quantity),
        unitPrice: parseFloat(item.unitPrice),
        productCode: item.productCode || "78101800",
        unitCode: item.unitCode || "E48",
      })),
    })
  }

  const subtotal = items.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0), 0)
  const tax = subtotal * 0.16
  const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`
  const customerShipments = shipments.filter((s) => s.customer.id === customerId && s.status !== "cancelled")

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/invoices" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Facturas
        </Link>
        <h1 className="text-2xl font-bold">Nueva factura</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-3xl">
        <Card>
          <CardHeader><CardTitle>Receptor</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="customerId" label="Cliente"
              placeholder="Selecciona un cliente..."
              options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
              value={customerId}
              onChange={(e) => { setCustomerId(e.target.value); setShipmentId("") }}
              error={errors["customerId"]}
            />
            <Select
              id="shipmentId" label="Expediente (opcional)"
              placeholder="Sin expediente"
              options={customerShipments.map((s) => ({ value: s.id, label: `${s.folio} — ${s.origin} → ${s.destination}` }))}
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              disabled={!customerId}
            />
            <Select id="cfdiUse" label="Uso CFDI" options={CFDI_USES} value={cfdiUse} onChange={(e) => setCfdiUse(e.target.value)} />
            <Select id="paymentForm" label="Forma de pago" options={PAYMENT_FORMS} value={paymentForm} onChange={(e) => setPaymentForm(e.target.value)} />
            <Select id="paymentMethod" label="Método de pago" options={PAYMENT_METHODS} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Conceptos</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="h-3 w-3" /> Agregar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_80px_110px_36px] gap-2 items-start">
                <Input
                  placeholder="Descripción del servicio"
                  value={item.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  error={errors[`item_${idx}_desc`]}
                />
                <Input
                  placeholder="Cant."
                  type="number" min="0.01" step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                  error={errors[`item_${idx}_qty`]}
                />
                <Input
                  placeholder="Precio unit."
                  type="number" min="0.01" step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(idx, "unitPrice", e.target.value)}
                  error={errors[`item_${idx}_price`]}
                />
                <button
                  type="button"
                  onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  className="mt-1 h-8 w-8 flex items-center justify-center rounded hover:bg-red-50 text-[--color-muted-foreground] hover:text-[--color-destructive] disabled:opacity-30 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <div className="mt-2 rounded-md bg-[--color-muted] p-3 text-sm self-end w-56">
              <div className="flex justify-between text-[--color-muted-foreground]"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-[--color-muted-foreground]"><span>IVA 16%</span><span>{fmt(tax)}</span></div>
              <div className="mt-1 flex justify-between border-t border-[--color-border] pt-1 font-semibold"><span>Total</span><span>{fmt(subtotal + tax)}</span></div>
            </div>
          </CardContent>
        </Card>

        {errors["general"] && <p className="text-sm text-[--color-destructive]">{errors["general"]}</p>}

        <div className="flex gap-3">
          <Link to="/invoices"><Button type="button" variant="outline">Cancelar</Button></Link>
          <Button type="submit" loading={mutation.isPending}>Crear factura borrador</Button>
        </div>
      </form>
    </AppLayout>
  )
}
