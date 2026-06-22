import { Plus, Trash2, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { MoneyInput } from "@/components/ui/money-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AddressInput, type AddressValue } from "@/components/ui/address-input"
import { useCatalog } from "@/hooks/use-catalog"
import { useToast } from "@/components/ui/toast"
import { personaType, personaFromRfc, PERSONA_LABEL, FORWARDING_CFDI_USES, cfdiUseAppliesToPersona, regimeAppliesToPersona } from "@/lib/fiscal"
import { validateCp, validateEmail, validatePhone, validateRequired, validateRfc, collectErrors, scrollToFirstError } from "@/lib/validators"
import type { Customer, CustomerPayload } from "@/api/customers"

const STATUS_OPTIONS = [
  { value: "prospect", label: "Prospecto" },
  { value: "active", label: "Activo" },
  { value: "suspended", label: "Suspendido" },
  { value: "blocked", label: "Bloqueado" },
  { value: "inactive", label: "Inactivo" },
]

const CUSTOMER_TYPE_OPTIONS = [
  { value: "shipper", label: "Shipper / embarcador" },
  { value: "consignee", label: "Consignee / consignatario" },
  { value: "bill_to", label: "Bill-to / facturación" },
  { value: "importer", label: "Importador" },
  { value: "exporter", label: "Exportador" },
  { value: "other", label: "Otro" },
]

const CONTACT_TYPE_OPTIONS = [
  { value: "operations", label: "Operaciones" },
  { value: "billing", label: "Facturación" },
  { value: "collections", label: "Cobranza" },
  { value: "legal", label: "Legal" },
  { value: "executive", label: "Ejecutivo" },
  { value: "other", label: "Otro" },
]

const ADDRESS_TYPE_OPTIONS = [
  { value: "fiscal", label: "Fiscal" },
  { value: "commercial", label: "Comercial" },
  { value: "pickup", label: "Recolección" },
  { value: "delivery", label: "Entrega" },
  { value: "warehouse", label: "Bodega" },
  { value: "plant", label: "Planta" },
  { value: "port", label: "Puerto / terminal" },
  { value: "other", label: "Otro" },
]

const COMPLIANCE_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "complete", label: "Completo" },
  { value: "expired", label: "Vencido" },
  { value: "rejected", label: "Rechazado" },
]

const DOCUMENTS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "complete", label: "Completo" },
  { value: "expired", label: "Vencido" },
]

const FALLBACK_COUNTRY_OPTIONS = [
  { value: "MX", label: "MX – México" },
  { value: "US", label: "US – Estados Unidos" },
]

const FALLBACK_CURRENCY_OPTIONS = [
  { value: "MXN", label: "MXN – Peso mexicano" },
  { value: "USD", label: "USD – Dólar estadounidense" },
]

interface FormState {
  name: string
  legalName: string
  tradeName: string
  rfc: string
  email: string
  phone: string
  fiscalRegime: string
  fiscalZipCode: string
  status: string
  customerType: string
  taxCountry: string
  foreignTaxId: string
  defaultCfdiUse: string
  defaultPaymentForm: string
  defaultPaymentMethod: string
  creditTermsDays: string
  creditLimit: string
  creditCurrency: string
  salesOwner: string
  operationsNotes: string
  billingNotes: string
  complianceStatus: string
  documentsStatus: string
  contacts: ContactForm[]
  addresses: AddressForm[]
}

interface ContactForm {
  type: string
  name: string
  email: string
  phone: string
  mobile: string
  position: string
  isPrimary: boolean
  active: boolean
  notes: string
}

interface AddressForm {
  type: string
  label: string
  formatted: string
  detail?: AddressValue
  isPrimary: boolean
  active: boolean
  notes: string
}

interface CustomerMasterFormProps {
  customer?: Customer
  loading?: boolean
  submitLabel: string
  onSubmit: (payload: CustomerPayload) => void
  children?: ReactNode
  /** Campos a resaltar al llegar (p. ej. desde un expediente con datos faltantes) */
  highlight?: string[]
}

// Campos que un expediente puede exigir → etiqueta + clave de error en el form
const HIGHLIGHT_FIELDS: Record<string, { label: string; errorKey: string }> = {
  fiscalRegime: { label: "Régimen fiscal", errorKey: "fiscalRegime" },
  fiscalZipCode: { label: "CP fiscal", errorKey: "fiscalZipCode" },
  legalName: { label: "Razón social fiscal", errorKey: "legalName" },
  contacts: { label: "Al menos un contacto", errorKey: "contact_0_name" },
}
function initialErrors(highlight: string[] | undefined): Record<string, string> {
  const e: Record<string, string> = {}
  for (const key of highlight ?? []) {
    const f = HIGHLIGHT_FIELDS[key]
    if (f) e[f.errorKey] = "Requerido para usar el cliente en expedientes"
  }
  return e
}

const emptyContact = (): ContactForm => ({
  type: "operations",
  name: "",
  email: "",
  phone: "",
  mobile: "",
  position: "",
  isPrimary: false,
  active: true,
  notes: "",
})

const emptyAddress = (): AddressForm => ({
  type: "commercial",
  label: "",
  formatted: "",
  isPrimary: false,
  active: true,
  notes: "",
})

function initialState(customer?: Customer): FormState {
  return {
    name: customer?.name ?? "",
    legalName: customer?.legalName ?? "",
    tradeName: customer?.tradeName ?? "",
    rfc: customer?.rfc ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    fiscalRegime: customer?.fiscalRegime ?? "",
    fiscalZipCode: customer?.fiscalZipCode ?? "",
    status: customer?.status ?? "prospect",
    customerType: customer?.customerType ?? "shipper",
    taxCountry: customer?.taxCountry ?? "MX",
    foreignTaxId: customer?.foreignTaxId ?? "",
    defaultCfdiUse: customer?.defaultCfdiUse ?? "",
    defaultPaymentForm: customer?.defaultPaymentForm ?? "",
    defaultPaymentMethod: customer?.defaultPaymentMethod ?? "",
    creditTermsDays: customer?.creditTermsDays?.toString() ?? "",
    creditLimit: customer?.creditLimit?.toString() ?? "",
    creditCurrency: customer?.creditCurrency ?? "MXN",
    salesOwner: customer?.salesOwner ?? "",
    operationsNotes: customer?.operationsNotes ?? "",
    billingNotes: customer?.billingNotes ?? "",
    complianceStatus: customer?.complianceStatus ?? "pending",
    documentsStatus: customer?.documentsStatus ?? "pending",
    contacts: customer?.contacts?.length
      ? customer.contacts.map((c) => ({
          type: c.type,
          name: c.name,
          email: c.email ?? "",
          phone: c.phone ?? "",
          mobile: c.mobile ?? "",
          position: c.position ?? "",
          isPrimary: c.isPrimary,
          active: c.active,
          notes: c.notes ?? "",
        }))
      : customer?.billingEmail
        ? [{ ...emptyContact(), type: "billing", name: "Facturación", email: customer.billingEmail, isPrimary: true }]
      : [emptyContact()],
    addresses: customer?.addresses?.length
      ? customer.addresses.map((a) => ({
          type: a.type,
          label: a.label ?? "",
          formatted: a.formatted ?? (a.address?.["formatted"] as string | undefined) ?? "",
          detail: a.address as AddressValue | undefined,
          isPrimary: a.isPrimary,
          active: a.active,
          notes: a.notes ?? "",
        }))
      : [emptyAddress()],
  }
}

export function CustomerMasterForm({ customer, loading, submitLabel, onSubmit, children, highlight }: CustomerMasterFormProps) {
  const { items: regimenItems } = useCatalog("sat_tax_regime")
  const { items: cfdiUseItems } = useCatalog("sat_cfdi_use")
  const { options: paymentFormOptions } = useCatalog("sat_payment_form")
  const { options: paymentMethodOptions } = useCatalog("sat_payment_method")
  const { options: catalogCountryOptions } = useCatalog("country")
  const { options: catalogCurrencyOptions } = useCatalog("currency")
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => initialState(customer))
  const [errors, setErrors] = useState<Record<string, string>>(() => initialErrors(highlight))
  const isEdit = Boolean(customer)
  const highlightLabels = (highlight ?? []).map((k) => HIGHLIGHT_FIELDS[k]?.label).filter(Boolean) as string[]
  // Resalte fuerte (anillo ámbar) para los campos que el expediente exige completar
  const hlSet = new Set(highlight ?? [])
  const hl = (key: string) => (hlSet.has(key) ? "ring-2 ring-amber-400 ring-offset-1" : undefined)

  // Al llegar con campos resaltados, lleva la vista al primero
  useEffect(() => {
    if (!highlightLabels.length) return
    const t = setTimeout(() => {
      document.querySelector(".text-\\[var\\(--color-destructive\\)\\]")?.scrollIntoView({ behavior: "smooth", block: "center" })
    }, 100)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const countryOptions = catalogCountryOptions.length ? catalogCountryOptions : FALLBACK_COUNTRY_OPTIONS
  const currencyOptions = catalogCurrencyOptions.length ? catalogCurrencyOptions : FALLBACK_CURRENCY_OPTIONS
  const selectedRegime = regimenItems.find((item) => item.code === form.fiscalRegime)
  const selectedRegimeExtra = selectedRegime?.extra as { moral?: boolean; physical?: boolean } | null | undefined
  // Tipo de persona unificado (régimen autoritativo, RFC como respaldo) — ver lib/fiscal
  const persona = personaType(form.rfc, selectedRegimeExtra)

  // El régimen se acota al tipo de persona que dicta el RFC (12=moral, 13=física).
  // Mientras el RFC no defina persona (incompleto), se muestran todos.
  const rfcPersona = personaFromRfc(form.rfc)
  const regimenOptions = regimenItems
    .filter((item) => regimeAppliesToPersona(item.extra as { moral?: boolean; physical?: boolean } | null, rfcPersona))
    .map((item) => ({ value: item.code, label: `${item.code} – ${item.name}` }))

  // Si el régimen elegido ya no corresponde al RFC (p. ej. cambió el RFC), se limpia.
  useEffect(() => {
    if (!regimenItems.length || !rfcPersona || !form.fiscalRegime) return
    if (!regimeAppliesToPersona(selectedRegimeExtra, rfcPersona)) set("fiscalRegime", "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.rfc, regimenItems])
  const cfdiUseOptions = cfdiUseItems
    .filter((item) => FORWARDING_CFDI_USES.includes(item.code))
    .filter((item) => cfdiUseAppliesToPersona(item.extra as { moral?: boolean; physical?: boolean } | null, persona))
    .map((item) => ({ value: item.code, label: `${item.code} – ${item.name}` }))

  // Método de pago default manda sobre la forma: PPD ⇒ forma "99 - Por definir"; PUE ⇒ forma real (sin 99)
  const isDefaultPPD = form.defaultPaymentMethod === "PPD"
  const defaultFormOptions = isDefaultPPD
    ? paymentFormOptions.filter((option) => option.value === "99")
    : paymentFormOptions.filter((option) => option.value !== "99")

  useEffect(() => {
    if (form.defaultCfdiUse && !cfdiUseOptions.some((option) => option.value === form.defaultCfdiUse)) {
      set("defaultCfdiUse", "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.fiscalRegime, form.rfc, cfdiUseItems])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setDefaultPaymentMethod(value: string) {
    setForm((f) => ({
      ...f,
      defaultPaymentMethod: value,
      defaultPaymentForm: value === "PPD" ? "99" : f.defaultPaymentForm === "99" ? "" : f.defaultPaymentForm,
    }))
  }

  function validate() {
    const checks: Record<string, string | undefined> = {
      name: validateRequired(form.name, "Nombre"),
      rfc: validateRfc(form.rfc),
      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      fiscalZipCode: validateCp(form.fiscalZipCode),
    }
    if (form.creditTermsDays && (!/^\d+$/.test(form.creditTermsDays) || Number(form.creditTermsDays) < 0)) {
      checks["creditTermsDays"] = "Días inválidos"
    }
    if (form.creditLimit && (Number.isNaN(Number(form.creditLimit)) || Number(form.creditLimit) < 0)) {
      checks["creditLimit"] = "Límite inválido"
    }
    form.contacts.forEach((contact, index) => {
      const hasData = [contact.name, contact.email, contact.phone, contact.mobile, contact.position].some((v) => v.trim())
      if (hasData) {
        checks[`contact_${index}_name`] = validateRequired(contact.name, "Contacto")
        checks[`contact_${index}_email`] = validateEmail(contact.email)
        checks[`contact_${index}_phone`] = validatePhone(contact.phone)
        checks[`contact_${index}_mobile`] = validatePhone(contact.mobile)
      }
    })
    return collectErrors(checks)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors = validate()
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
    setErrors({})

    const contacts = form.contacts
      .filter((contact) => [contact.name, contact.email, contact.phone, contact.mobile, contact.position].some((v) => v.trim()))
      .map((contact) => ({
        type: contact.type,
        name: contact.name.trim(),
        email: contact.email || null,
        phone: contact.phone || null,
        mobile: contact.mobile || null,
        position: contact.position || null,
        isPrimary: contact.isPrimary,
        active: contact.active,
        notes: contact.notes || null,
      }))

    const addresses = form.addresses
      .filter((address) => address.formatted.trim() || address.label.trim())
      .map((address) => ({
        type: address.type,
        label: address.label || null,
        address: address.detail ?? (address.formatted ? { formatted: address.formatted } : null),
        formatted: address.detail?.formatted ?? (address.formatted || null),
        street: address.detail?.street ?? null,
        city: address.detail?.city ?? null,
        state: address.detail?.state ?? null,
        country: address.detail?.country ?? null,
        postalCode: address.detail?.postalCode ?? null,
        lat: address.detail?.lat ?? null,
        lng: address.detail?.lng ?? null,
        isPrimary: address.isPrimary,
        active: address.active,
        notes: address.notes || null,
      }))

    const billingContact = contacts.find((contact) => contact.type === "billing" && contact.isPrimary && contact.email)
      ?? contacts.find((contact) => contact.type === "billing" && contact.email)

    onSubmit({
      name: form.name.trim(),
      legalName: form.legalName || null,
      tradeName: form.tradeName || null,
      rfc: form.rfc.toUpperCase(),
      email: form.email || null,
      phone: form.phone || null,
      address: addresses[0]?.address ?? null,
      fiscalRegime: form.fiscalRegime || null,
      fiscalZipCode: form.fiscalZipCode || null,
      status: form.status,
      customerType: form.customerType,
      taxCountry: form.taxCountry || "MX",
      foreignTaxId: form.taxCountry !== "MX" ? form.foreignTaxId || null : null,
      defaultCfdiUse: form.defaultCfdiUse || null,
      defaultPaymentForm: form.defaultPaymentForm || null,
      defaultPaymentMethod: form.defaultPaymentMethod || null,
      billingEmail: billingContact?.email ?? (form.email || null),
      creditTermsDays: form.creditTermsDays ? Number(form.creditTermsDays) : null,
      creditLimit: form.creditLimit ? Number(form.creditLimit) : null,
      creditCurrency: form.creditCurrency || "MXN",
      salesOwner: form.salesOwner || null,
      operationsNotes: form.operationsNotes || null,
      billingNotes: form.billingNotes || null,
      complianceStatus: form.complianceStatus,
      documentsStatus: form.documentsStatus,
      contacts,
      addresses,
    })
  }

  return (
    <form onSubmit={submit} className="flex max-w-5xl flex-col gap-4">
      {highlightLabels.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold">Completa estos datos para usar el cliente en expedientes:</p>
            <p className="text-[var(--color-muted-foreground)]">{highlightLabels.join(" · ")}</p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader><CardTitle>Identidad del cliente</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input id="name" label="Nombre visible" value={form.name} onChange={(e) => set("name", e.target.value)} error={errors["name"]} />
          <Input id="legalName" label="Razón social fiscal" value={form.legalName} onChange={(e) => set("legalName", e.target.value)} error={errors["legalName"]} className={hl("legalName")} placeholder="Debe coincidir con la constancia" />
          <Input id="rfc" label={form.taxCountry === "MX" ? "RFC" : "RFC genérico para CFDI"} value={form.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} error={errors["rfc"]} maxLength={13} disabled={isEdit} />
          <Select id="status" label="Estatus operativo" options={STATUS_OPTIONS} value={form.status} onChange={(e) => set("status", e.target.value)} />
          <Select id="customerType" label="Rol principal" options={CUSTOMER_TYPE_OPTIONS} value={form.customerType} onChange={(e) => set("customerType", e.target.value)} />
          <Input id="email" label="Correo general" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} error={errors["email"]} />
          <Input id="phone" label="Teléfono general" value={form.phone} onChange={(e) => set("phone", e.target.value)} error={errors["phone"]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Perfil fiscal</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Select id="fiscalRegime" label="Régimen fiscal" placeholder="Selecciona..." options={regimenOptions} value={form.fiscalRegime} onChange={(e) => set("fiscalRegime", e.target.value)} error={errors["fiscalRegime"]} className={hl("fiscalRegime")} />
            {rfcPersona
              ? <p className="text-xs text-[var(--color-muted-foreground)]">Solo régimenes de {rfcPersona === "fisica" ? "persona física" : "persona moral"} (según el RFC).</p>
              : <p className="text-xs text-[var(--color-muted-foreground)]">Captura el RFC para acotar los régimenes.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-foreground)]">Tipo de persona</span>
            <div className="flex h-9 items-center">
              {persona ? <Badge variant="outline">{PERSONA_LABEL[persona]}</Badge> : <span className="text-sm text-[var(--color-muted-foreground)]">Según RFC / régimen</span>}
            </div>
          </div>
          <Input id="fiscalZipCode" label="CP fiscal" value={form.fiscalZipCode} onChange={(e) => set("fiscalZipCode", e.target.value)} error={errors["fiscalZipCode"]} className={hl("fiscalZipCode")} maxLength={5} />
          <Select id="taxCountry" label="País fiscal" placeholder="Selecciona..." options={countryOptions} value={form.taxCountry} onChange={(e) => set("taxCountry", e.target.value)} />
          {form.taxCountry !== "MX" && (
            <Input id="foreignTaxId" label="Tax ID extranjero" value={form.foreignTaxId} onChange={(e) => set("foreignTaxId", e.target.value)} />
          )}
          <Select id="defaultCfdiUse" label="Uso CFDI por defecto" placeholder="Selecciona..." options={cfdiUseOptions} value={form.defaultCfdiUse} onChange={(e) => set("defaultCfdiUse", e.target.value)} />
          <Select id="defaultPaymentMethod" label="Método de pago default" placeholder="Selecciona..." options={paymentMethodOptions} value={form.defaultPaymentMethod} onChange={(e) => setDefaultPaymentMethod(e.target.value)} />
          <div className="flex flex-col gap-1">
            <Select id="defaultPaymentForm" label="Forma de pago default" placeholder="Selecciona..." options={defaultFormOptions} value={form.defaultPaymentForm} onChange={(e) => set("defaultPaymentForm", e.target.value)} disabled={isDefaultPPD} />
            {isDefaultPPD && <p className="text-xs text-[var(--color-muted-foreground)]">PPD usa forma "99 - Por definir" (regla SAT).</p>}
          </div>
          <Select id="complianceStatus" label="Cumplimiento fiscal/KYC" options={COMPLIANCE_OPTIONS} value={form.complianceStatus} onChange={(e) => set("complianceStatus", e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Condiciones comerciales</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Input id="creditTermsDays" label="Días de crédito" type="number" min="0" value={form.creditTermsDays} onChange={(e) => set("creditTermsDays", e.target.value)} error={errors["creditTermsDays"]} />
          <MoneyInput id="creditLimit" label="Límite de crédito" currency={form.creditCurrency} value={form.creditLimit} onChange={(v) => set("creditLimit", v)} error={errors["creditLimit"]} />
          <Select id="creditCurrency" label="Moneda" options={currencyOptions} value={form.creditCurrency} onChange={(e) => set("creditCurrency", e.target.value)} />
          <Input id="salesOwner" label="Ejecutivo comercial" value={form.salesOwner} onChange={(e) => set("salesOwner", e.target.value)} />
          <Select id="documentsStatus" label="Documentación" options={DOCUMENTS_OPTIONS} value={form.documentsStatus} onChange={(e) => set("documentsStatus", e.target.value)} />
        </CardContent>
      </Card>

      <Card className={hlSet.has("contacts") ? "ring-2 ring-amber-400" : ""}>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Contactos</CardTitle>
            {hlSet.has("contacts") && <p className="mt-1 text-sm font-medium text-amber-600">Falta: agrega al menos un contacto.</p>}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => set("contacts", [...form.contacts, emptyContact()])}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {form.contacts.map((contact, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] p-3 md:grid-cols-6">
              <Select id={`contact-type-${index}`} label="Tipo" options={CONTACT_TYPE_OPTIONS} value={contact.type} onChange={(e) => updateContact(index, { type: e.target.value })} />
              <Input id={`contact-name-${index}`} label="Nombre" value={contact.name} onChange={(e) => updateContact(index, { name: e.target.value })} error={errors[`contact_${index}_name`]} className={hlSet.has("contacts") && index === 0 ? "ring-2 ring-amber-400 ring-offset-1" : undefined} />
              <Input id={`contact-email-${index}`} label="Correo" type="email" value={contact.email} onChange={(e) => updateContact(index, { email: e.target.value })} error={errors[`contact_${index}_email`]} />
              <Input id={`contact-phone-${index}`} label="Teléfono" value={contact.phone} onChange={(e) => updateContact(index, { phone: e.target.value })} error={errors[`contact_${index}_phone`]} />
              <Input id={`contact-mobile-${index}`} label="Móvil" value={contact.mobile} onChange={(e) => updateContact(index, { mobile: e.target.value })} error={errors[`contact_${index}_mobile`]} />
              <div className="flex items-end justify-between gap-2">
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-muted-foreground)]">
                  <input type="checkbox" checked={contact.isPrimary} onChange={(e) => updateContact(index, { isPrimary: e.target.checked }, true)} />
                  Principal
                </label>
                <button type="button" className="rounded p-2 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)]" onClick={() => set("contacts", form.contacts.filter((_, i) => i !== index))} disabled={form.contacts.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Direcciones</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => set("addresses", [...form.addresses, emptyAddress()])}>
            <Plus className="h-3.5 w-3.5" /> Agregar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {form.addresses.map((address, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-md border border-[var(--color-border)] p-3 md:grid-cols-[180px_minmax(0,1fr)_180px_112px_40px]">
              <Select id={`address-type-${index}`} label="Tipo" options={ADDRESS_TYPE_OPTIONS} value={address.type} onChange={(e) => updateAddress(index, { type: e.target.value })} />
              <AddressInput
                id={`address-${index}`}
                label="Dirección"
                value={address.formatted}
                onChange={(formatted, detail) => updateAddress(index, { formatted, detail })}
              />
              <Input id={`address-label-${index}`} label="Etiqueta" value={address.label} onChange={(e) => updateAddress(index, { label: e.target.value })} placeholder="Matriz, planta, bodega..." />
              <div className="flex items-end">
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-muted-foreground)]">
                  <input type="checkbox" checked={address.isPrimary} onChange={(e) => updateAddress(index, { isPrimary: e.target.checked })} />
                  Principal
                </label>
              </div>
              <div className="flex items-end justify-end">
                <button type="button" className="mb-0.5 rounded p-2 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-[var(--color-destructive)] disabled:opacity-30" onClick={() => set("addresses", form.addresses.filter((_, i) => i !== index))} disabled={form.addresses.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Instrucciones internas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldTextArea id="operationsNotes" label="Notas operativas" value={form.operationsNotes} onChange={(value) => set("operationsNotes", value)} />
          <FieldTextArea id="billingNotes" label="Notas de facturación/cobranza" value={form.billingNotes} onChange={(value) => set("billingNotes", value)} />
        </CardContent>
      </Card>

      {children}

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </div>
    </form>
  )

  function updateContact(index: number, patch: Partial<ContactForm>, exclusivePrimary = false) {
    set("contacts", form.contacts.map((contact, i) => {
      if (i === index) return { ...contact, ...patch }
      if (exclusivePrimary && patch.isPrimary) {
        const targetType = patch.type ?? form.contacts[index]?.type
        if (contact.type === targetType) return { ...contact, isPrimary: false }
      }
      return contact
    }))
  }

  function updateAddress(index: number, patch: Partial<AddressForm>) {
    set("addresses", form.addresses.map((address, i) => (i === index ? { ...address, ...patch } : address)))
  }
}

function FieldTextArea({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-foreground)]">{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-foreground)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
    </div>
  )
}
