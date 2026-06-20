import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState, useEffect } from "react"
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
import { useCatalog } from "@/hooks/use-catalog"
import { Badge } from "@/components/ui/badge"
import { personaType, PERSONA_LABEL, FORWARDING_CFDI_USES, cfdiUseAppliesToPersona } from "@/lib/fiscal"
import { validateRequired, validateQuantity, validateUnitPrice, scrollToFirstError } from "@/lib/validators"
import { useToast } from "@/components/ui/toast"
import { ensurePermission } from "@/lib/permissions"

export const Route = createFileRoute("/invoices/new")({
  beforeLoad: () => ensurePermission("invoices.create"),
  component: NewInvoicePage,
})

interface LineItem { description: string; quantity: string; unitPrice: string; productCode: string; unitCode: string }
const emptyItem = (): LineItem => ({ description: "", quantity: "1", unitPrice: "", productCode: "78101800", unitCode: "E48" })

function NewInvoicePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: customersApi.list })
  const { data: shipments = [] } = useQuery({ queryKey: ["shipments"], queryFn: shipmentsApi.list })
  const { items: cfdiUseItems } = useCatalog("sat_cfdi_use")
  const { items: regimeItems } = useCatalog("sat_tax_regime")
  const { options: paymentFormOptions } = useCatalog("sat_payment_form")
  const { options: paymentMethodOptions } = useCatalog("sat_payment_method")
  // Claves SAT curadas para forwarding (admin las edita en Catálogos)
  const { options: productOptions } = useCatalog("sat_product_key")
  const { options: unitOptions } = useCatalog("sat_unit_key")

  const [customerId, setCustomerId] = useState("")
  const [shipmentId, setShipmentId] = useState("")
  const [cfdiUse, setCfdiUse] = useState("G03")
  const [paymentForm, setPaymentForm] = useState("03")
  const [paymentMethod, setPaymentMethod] = useState("PUE")
  const [items, setItems] = useState<LineItem[]>([emptyItem()])
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Receptor → persona (régimen fiscal autoritativo, RFC como respaldo) para filtrar el Uso CFDI
  const selectedCustomer = customers.find((c) => c.id === customerId)
  const regimeExtra = selectedCustomer
    ? (regimeItems.find((r) => r.code === selectedCustomer.fiscalRegime)?.extra as { moral?: boolean; physical?: boolean } | null | undefined)
    : null
  const persona = selectedCustomer ? personaType(selectedCustomer.rfc, regimeExtra) : null
  // Lista curada de forwarding + aplicabilidad por persona del receptor
  const cfdiUseOptions = cfdiUseItems
    .filter((i) => FORWARDING_CFDI_USES.includes(i.code))
    .filter((i) => cfdiUseAppliesToPersona(i.extra as { moral?: boolean; physical?: boolean } | null, persona))
    .map((i) => ({ value: i.code, label: `${i.code} – ${i.name}` }))

  // Método de pago manda sobre forma: PPD ⇒ forma "99 - Por definir"; PUE ⇒ forma real (sin 99)
  const isPPD = paymentMethod === "PPD"
  const formOptions = isPPD
    ? paymentFormOptions.filter((o) => o.value === "99")
    : paymentFormOptions.filter((o) => o.value !== "99")

  function onPaymentMethodChange(v: string) {
    setPaymentMethod(v)
    if (v === "PPD") setPaymentForm("99")
    else if (paymentForm === "99") setPaymentForm("03")
  }

  // Si el uso seleccionado no aplica al receptor, corrige al primero válido (G03 por defecto)
  useEffect(() => {
    if (!persona) return
    if (!cfdiUseOptions.some((o) => o.value === cfdiUse)) {
      setCfdiUse(cfdiUseOptions.find((o) => o.value === "G03")?.value ?? cfdiUseOptions[0]?.value ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, cfdiUseItems])

  const mutation = useMutation({
    mutationFn: invoicesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      toast.success("Factura borrador creada")
      navigate({ to: "/invoices" })
    },
    onError: (err: Error) => toast.error("No se pudo crear la factura", err.message),
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
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", errs["general"] ?? "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
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
            <div className="flex flex-col gap-1.5">
              <Select
                id="customerId" label="Cliente"
                placeholder="Selecciona un cliente..."
                options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.rfc})` }))}
                value={customerId}
                onChange={(e) => {
                  const nextCustomerId = e.target.value
                  const customer = customers.find((c) => c.id === nextCustomerId)
                  setCustomerId(nextCustomerId)
                  setShipmentId("")
                  setCfdiUse(customer?.defaultCfdiUse ?? "G03")
                  setPaymentForm(customer?.defaultPaymentForm ?? "03")
                  setPaymentMethod(customer?.defaultPaymentMethod ?? "PUE")
                }}
                error={errors["customerId"]}
              />
              {persona && (
                <span><Badge variant="outline">{PERSONA_LABEL[persona]}</Badge></span>
              )}
            </div>
            <Select
              id="shipmentId" label="Expediente (opcional)"
              placeholder="Sin expediente"
              options={customerShipments.map((s) => ({ value: s.id, label: `${s.folio} — ${s.origin} → ${s.destination}` }))}
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              disabled={!customerId}
            />
            <Select id="cfdiUse" label="Uso CFDI" placeholder="Selecciona..." options={cfdiUseOptions} value={cfdiUse} onChange={(e) => setCfdiUse(e.target.value)} />
            <Select id="paymentMethod" label="Método de pago" placeholder="Selecciona..." options={paymentMethodOptions} value={paymentMethod} onChange={(e) => onPaymentMethodChange(e.target.value)} />
            <div className="flex flex-col gap-1">
              <Select id="paymentForm" label="Forma de pago" placeholder="Selecciona..." options={formOptions} value={paymentForm} onChange={(e) => setPaymentForm(e.target.value)} disabled={isPPD} />
              {isPPD && <p className="text-xs text-[--color-muted-foreground]">PPD usa forma "99 - Por definir" (regla SAT).</p>}
            </div>
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
              <div key={idx} className="flex flex-col gap-2 rounded-md border border-[--color-border] p-3">
                <div className="grid grid-cols-[1fr_80px_110px_36px] items-start gap-2">
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
                    className="mt-1 flex h-8 w-8 items-center justify-center rounded text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive] disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
                  <Select
                    label="Clave producto/servicio SAT" placeholder="Selecciona..."
                    options={productOptions}
                    value={item.productCode} onChange={(e) => updateItem(idx, "productCode", e.target.value)}
                  />
                  <Select
                    label="Clave unidad SAT" placeholder="Selecciona..."
                    options={unitOptions}
                    value={item.unitCode} onChange={(e) => updateItem(idx, "unitCode", e.target.value)}
                  />
                </div>
              </div>
            ))}

            <div className="mt-2 rounded-md bg-[--color-muted] p-3 text-sm self-end w-56">
              <div className="flex justify-between text-[--color-muted-foreground]"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-[--color-muted-foreground]"><span>IVA 16%</span><span>{fmt(tax)}</span></div>
              <div className="mt-1 flex justify-between border-t border-[--color-border] pt-1 font-semibold"><span>Total</span><span>{fmt(subtotal + tax)}</span></div>
            </div>
          </CardContent>
        </Card>


        <div className="flex gap-3">
          <Link to="/invoices"><Button type="button" variant="outline">Cancelar</Button></Link>
          <Button type="submit" loading={mutation.isPending}>Crear factura borrador</Button>
        </div>
      </form>
    </AppLayout>
  )
}
