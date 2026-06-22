import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Settings as SettingsIcon, Save } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { settingsApi, type AppSettings } from "@/api/settings"
import { useSettings, SETTINGS_DEFAULTS } from "@/hooks/use-settings"
import { MODULES, type ModuleKey } from "@/hooks/use-modules"
import { useCatalog } from "@/hooks/use-catalog"
import { authClient } from "@/lib/auth-client"
import { validateRfc, validateCp, validateSeries, validateFolioPrefix, validateRequired, validateGcsBucket, collectErrors } from "@/lib/validators"
import { useToast } from "@/components/ui/toast"

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role
    if (role !== "admin") throw redirect({ to: "/" })
  },
  component: SettingsPage,
})

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
  const toast = useToast()
  const { settings, isLoading } = useSettings()
  const { options: regimenOptions } = useCatalog("sat_tax_regime")
  const [form, setForm] = useState<AppSettings>(SETTINGS_DEFAULTS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [section, setSection] = useState<"general" | "facturacion" | "mapas" | "modulos" | "sistema">("general")
  const SECTIONS = [
    { id: "general" as const, label: "General y apariencia" },
    { id: "facturacion" as const, label: "Facturación" },
    { id: "mapas" as const, label: "Mapas" },
    { id: "modulos" as const, label: "Módulos" },
    { id: "sistema" as const, label: "Sistema" },
  ]

  useEffect(() => {
    // Merge con defaults para que claves nuevas (branding.*) sean inputs controlados
    if (!isLoading) setForm({ ...SETTINGS_DEFAULTS, ...settings })
  }, [isLoading, settings])

  const mutation = useMutation({
    mutationFn: settingsApi.patch,
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings"], updated)
      toast.success("Configuración guardada")
    },
    onError: (err: Error) => toast.error("No se pudo guardar la configuración", err.message),
  })

  function set(key: keyof AppSettings, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  // Logo → data URL (se guarda inline en settings; logos son pequeños)
  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 200 * 1024) {
      setErrors((x) => ({ ...x, "branding.logoDataUrl": "El logo supera 200 KB; usa una imagen más ligera." }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      set("branding.logoDataUrl", String(reader.result))
      setErrors((x) => { const next = { ...x }; delete next["branding.logoDataUrl"]; return next })
    }
    reader.readAsDataURL(file)
  }

  const moduleEnabled = (key: ModuleKey) => form[`modules.${key}`] !== "false"
  const toggleModule = (key: ModuleKey) => set(`modules.${key}` as keyof AppSettings, moduleEnabled(key) ? "false" : "true")

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
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      return
    }
    setErrors({})
    mutation.mutate(form)
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-[var(--color-muted-foreground)]">
          Cargando configuración...
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <SettingsIcon className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        <h1 className="text-2xl font-bold">Configuración</h1>
      </div>

      {/* Sub-navegación: evita una página larguísima de una sola columna */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-lg bg-[var(--color-muted)] p-1 sm:max-w-2xl">
        {SECTIONS.map((s) => {
          const active = section === s.id
          return (
            <button key={s.id} type="button" onClick={() => setSection(s.id)}
              className={[
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
                active ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
              ].join(" ")}>
              {s.label}
            </button>
          )
        })}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-2xl">

        {section === "general" && (<>
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

        {/* ── Marca ── */}
        <Card>
          <CardHeader><CardTitle>Marca</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Input
              id="systemName"
              label="Nombre del sistema (menú)"
              value={form["branding.systemName"] as string}
              onChange={(e) => set("branding.systemName", e.target.value)}
              placeholder="HM Sistema"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[var(--color-foreground)]">Logo de la organización</label>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-sidebar,#111d2d)]">
                  {form["branding.logoDataUrl"]
                    ? <img src={form["branding.logoDataUrl"] as string} alt="Logo" className="h-full w-full object-contain" />
                    : <Logo size={28} className="text-white" bg="#111d2d" />}
                </div>
                <div className="flex flex-col gap-1">
                  <input id="logoFile" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onLogoFile}
                    className="text-sm file:mr-2 file:rounded-md file:border file:border-[var(--color-border)] file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" />
                  {form["branding.logoDataUrl"] && (
                    <button type="button" onClick={() => set("branding.logoDataUrl", "")} className="self-start text-xs text-[var(--color-destructive)] hover:underline">Quitar logo</button>
                  )}
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">PNG/JPG/SVG, idealmente cuadrado. Se muestra en el menú. Máx ~200 KB.</p>
              {errors["branding.logoDataUrl"] && <p className="text-xs text-[var(--color-destructive)]">{errors["branding.logoDataUrl"]}</p>}
            </div>
          </CardContent>
        </Card>

        {/* ── Apariencia ── */}
        <Card>
          <CardHeader><CardTitle>Apariencia</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-muted-foreground)]">Personaliza los colores del sistema (se aplican al guardar).</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ColorField label="Color primario" value={form["appearance.primaryColor"] as string} onChange={(v) => set("appearance.primaryColor", v)} />
              <ColorField label="Color de acento" value={form["appearance.accentColor"] as string} onChange={(v) => set("appearance.accentColor", v)} />
              <ColorField label="Color del menú" value={form["appearance.menuColor"] as string} onChange={(v) => set("appearance.menuColor", v)} />
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">El menú usa texto claro; elige un color de menú oscuro para que se lea bien.</p>
            <button type="button"
              onClick={() => { set("appearance.primaryColor", "#284a70"); set("appearance.accentColor", "#f49c2f"); set("appearance.menuColor", "#111d2d") }}
              className="self-start text-xs text-[var(--color-primary)] hover:underline">
              Restablecer colores por defecto
            </button>
          </CardContent>
        </Card>

        </>)}

        {section === "mapas" && (
        /* ── Mapas ── */
        <Card>
          <CardHeader>
            <CardTitle>Mapas y ubicaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm font-medium text-[var(--color-foreground)]">
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
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
                        : "border-[var(--color-border)] text-[var(--color-muted-foreground)]",
                      disabled ? "opacity-40 cursor-not-allowed" : "hover:border-[var(--color-primary)]/50",
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
              <p className="text-xs text-[var(--color-muted-foreground)]">
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

        )}

        {section === "facturacion" && (
        /* ── Facturación ── */
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
              options={regimenOptions}
            />
          </CardContent>
        </Card>

        )}

        {section === "modulos" && (
        /* ── Módulos habilitados ── */
        <Card>
          <CardHeader><CardTitle>Módulos del sistema</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Habilita o deshabilita módulos. Los deshabilitados desaparecen del menú y no son accesibles. Dashboard, Usuarios, Catálogos y Configuración siempre están disponibles.
            </p>
            <div className="flex flex-col divide-y divide-[var(--color-border)]">
              {MODULES.map((m) => {
                const enabled = moduleEnabled(m.key)
                return (
                  <div key={m.key} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{m.description}</p>
                    </div>
                    <button type="button" role="switch" aria-checked={enabled} onClick={() => toggleModule(m.key)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)]">Recuerda guardar los cambios. Más adelante (SaaS) esto se controlará por el plan de cada cliente.</p>
          </CardContent>
        </Card>
        )}

        {section === "sistema" && (<>
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
            <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
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
            <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">
              Los folios se generarán como {form["shipments.folioPrefix"] || "EXP"}-00001, {form["shipments.folioPrefix"] || "EXP"}-00002, …
            </p>
          </CardContent>
        </Card>

        </>)}

        {/* ── Acciones ── */}
        <div className="flex items-center gap-4">
          <Button type="submit" loading={mutation.isPending} className="flex items-center gap-2">
            <Save className="h-4 w-4" />
            Guardar cambios
          </Button>
        </div>

      </form>
    </AppLayout>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--color-foreground)]">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-[var(--color-border)] bg-white p-1" />
        <Input id={`color-${label}`} value={value} onChange={(e) => onChange(e.target.value)} className="flex-1" placeholder="#284a70" />
      </div>
    </div>
  )
}
