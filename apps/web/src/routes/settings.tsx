import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings as SettingsIcon, Save } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { settingsApi, type AppSettings } from "@/api/settings"
import { useSettings, SETTINGS_DEFAULTS } from "@/hooks/use-settings"
import { authClient } from "@/lib/auth-client"
import { validateRfc, validateCp, validateSeries, validateFolioPrefix, validateRequired, validateGcsBucket, collectErrors } from "@/lib/validators"

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role
    if (role !== "admin") throw redirect({ to: "/" })
  },
  component: SettingsPage,
})

const REGIMEN_FISCAL_OPTIONS = [
  { value: "601", label: "601 – General de Ley Personas Morales" },
  { value: "603", label: "603 – Personas Morales con Fines no Lucrativos" },
  { value: "605", label: "605 – Sueldos y Salarios e Ingresos Asimilados" },
  { value: "606", label: "606 – Arrendamiento" },
  { value: "608", label: "608 – Demás ingresos" },
  { value: "612", label: "612 – Personas Físicas con Actividades Empresariales" },
  { value: "616", label: "616 – Sin obligaciones fiscales" },
  { value: "621", label: "621 – Incorporación Fiscal" },
  { value: "626", label: "626 – Régimen Simplificado de Confianza" },
]

const TIMEZONE_OPTIONS = [
  { value: "America/Mexico_City", label: "Ciudad de México (CST/CDT)" },
  { value: "America/Tijuana", label: "Tijuana (PST/PDT)" },
  { value: "America/Chihuahua", label: "Chihuahua (MST/MDT)" },
  { value: "America/Cancun", label: "Cancún (EST)" },
]

// Google Maps Places API supports up to 5 country codes
const COUNTRY_OPTIONS = [
  { code: "mx", label: "🇲🇽 México" },
  { code: "us", label: "🇺🇸 Estados Unidos" },
  { code: "ca", label: "🇨🇦 Canadá" },
  { code: "gt", label: "🇬🇹 Guatemala" },
  { code: "bz", label: "🇧🇿 Belice" },
  { code: "hn", label: "🇭🇳 Honduras" },
  { code: "es", label: "🇪🇸 España" },
  { code: "cn", label: "🇨🇳 China" },
]

function SettingsPage() {
  const queryClient = useQueryClient()
  const { settings, isLoading } = useSettings()
  const [form, setForm] = useState<AppSettings>(SETTINGS_DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isLoading) setForm(settings)
  }, [isLoading, settings])

  const mutation = useMutation({
    mutationFn: settingsApi.patch,
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings"], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  function set(key: keyof AppSettings, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleCountry(code: string) {
    const current = form["maps.countries"] as string[]
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code]
    setForm((f) => ({ ...f, "maps.countries": next }))
  }

  const selectedCountries = form["maps.countries"] as string[]
  const atLimit = selectedCountries.length >= 5

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      "general.businessName": validateRequired(form["general.businessName"] as string, "Nombre del negocio"),
      // El emisor es opcional hasta configurar facturación, pero si se llena debe ser válido
      "invoicing.emisorRfc": validateRfc(form["invoicing.emisorRfc"] as string, { required: false }),
      "invoicing.emisorCp": validateCp(form["invoicing.emisorCp"] as string),
      "invoicing.series": validateSeries(form["invoicing.series"] as string),
      "shipments.folioPrefix": validateFolioPrefix(form["shipments.folioPrefix"] as string),
      "storage.bucket": validateGcsBucket(form["storage.bucket"] as string),
    })
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    mutation.mutate(form)
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-[--color-muted-foreground]">
          Cargando configuración...
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-[--color-muted-foreground]" />
        <h1 className="text-2xl font-bold">Configuración</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">

        {/* ── General ── */}
        <Card>
          <CardHeader><CardTitle>General</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              id="businessName"
              label="Nombre del negocio"
              value={form["general.businessName"] as string}
              onChange={(e) => set("general.businessName", e.target.value)}
              error={errors["general.businessName"]}
            />
            <Select
              id="timezone"
              label="Zona horaria"
              value={form["general.timezone"] as string}
              onChange={(e) => set("general.timezone", e.target.value)}
              options={TIMEZONE_OPTIONS}
            />
          </CardContent>
        </Card>

        {/* ── Mapas ── */}
        <Card>
          <CardHeader>
            <CardTitle>Mapas y ubicaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm font-medium text-[--color-foreground]">
              Países permitidos en autocompletado de direcciones
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {COUNTRY_OPTIONS.map(({ code, label }) => {
                const checked = selectedCountries.includes(code)
                const disabled = !checked && atLimit
                return (
                  <label
                    key={code}
                    className={[
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-[--color-primary] bg-[--color-primary]/10 text-[--color-foreground]"
                        : "border-[--color-border] text-[--color-muted-foreground]",
                      disabled ? "opacity-40 cursor-not-allowed" : "hover:border-[--color-primary]/50",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleCountry(code)}
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-[--color-muted-foreground]">
                {selectedCountries.length === 0
                  ? "Sin restricción — se mostrarán resultados de todo el mundo"
                  : `${selectedCountries.length} país${selectedCountries.length > 1 ? "es" : ""} seleccionado${selectedCountries.length > 1 ? "s" : ""}`}
              </p>
              {atLimit && (
                <p className="text-xs text-amber-600">Máximo 5 países (límite de Google Maps)</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Facturación ── */}
        <Card>
          <CardHeader><CardTitle>Facturación (CFDI)</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="emisorName"
                label="Razón social del emisor"
                value={form["invoicing.emisorName"] as string}
                onChange={(e) => set("invoicing.emisorName", e.target.value)}
                placeholder="Mi Empresa SA de CV"
              />
              <Input
                id="emisorRfc"
                label="RFC del emisor"
                value={form["invoicing.emisorRfc"] as string}
                onChange={(e) => set("invoicing.emisorRfc", e.target.value.toUpperCase())}
                placeholder="MEM010101ABC"
                maxLength={13}
                error={errors["invoicing.emisorRfc"]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                id="emisorCp"
                label="Código postal del emisor"
                value={form["invoicing.emisorCp"] as string}
                onChange={(e) => set("invoicing.emisorCp", e.target.value)}
                placeholder="06600"
                maxLength={5}
                error={errors["invoicing.emisorCp"]}
              />
              <Input
                id="invoicingSeries"
                label="Serie CFDI por defecto"
                value={form["invoicing.series"] as string}
                onChange={(e) => set("invoicing.series", e.target.value.toUpperCase())}
                placeholder="A"
                maxLength={10}
                error={errors["invoicing.series"]}
              />
            </div>
            <Select
              id="regimenFiscal"
              label="Régimen fiscal"
              value={form["invoicing.regimenFiscal"] as string}
              onChange={(e) => set("invoicing.regimenFiscal", e.target.value)}
              options={REGIMEN_FISCAL_OPTIONS}
            />
          </CardContent>
        </Card>

        {/* ── Almacenamiento ── */}
        <Card>
          <CardHeader><CardTitle>Almacenamiento de documentos</CardTitle></CardHeader>
          <CardContent>
            <Input
              id="storageBucket"
              label="Bucket de Google Cloud Storage"
              value={form["storage.bucket"] as string}
              onChange={(e) => set("storage.bucket", e.target.value.trim())}
              placeholder="mi-empresa-documentos"
              error={errors["storage.bucket"]}
            />
            <p className="mt-1.5 text-xs text-[--color-muted-foreground]">
              Las credenciales del proyecto GCP se configuran por variables de entorno
              (GCS_PROJECT_ID y GCS_CREDENTIALS_JSON). Aquí solo el nombre del bucket.
            </p>
          </CardContent>
        </Card>

        {/* ── Expedientes ── */}
        <Card>
          <CardHeader><CardTitle>Expedientes</CardTitle></CardHeader>
          <CardContent>
            <Input
              id="folioPrefix"
              label="Prefijo de folio"
              value={form["shipments.folioPrefix"] as string}
              onChange={(e) => set("shipments.folioPrefix", e.target.value.toUpperCase())}
              placeholder="EXP"
              maxLength={10}
              error={errors["shipments.folioPrefix"]}
            />
            <p className="mt-1.5 text-xs text-[--color-muted-foreground]">
              Los folios se generarán como {form["shipments.folioPrefix"] || "EXP"}-00001, {form["shipments.folioPrefix"] || "EXP"}-00002, …
            </p>
          </CardContent>
        </Card>

        {/* ── Acciones ── */}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={mutation.isPending} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
          {saved && (
            <span className="text-sm text-green-600 font-medium">✓ Configuración guardada</span>
          )}
          {mutation.isError && (
            <span className="text-sm text-[--color-destructive]">Error al guardar</span>
          )}
        </div>

      </form>
    </AppLayout>
  )
}
