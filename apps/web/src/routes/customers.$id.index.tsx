import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Building2, Pencil, Package, FileText, Mail, Phone, MapPin, Star } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, type TabItem } from "@/components/ui/tabs"
import { DocumentsSection } from "@/components/ui/documents-section"
import { customersApi, type CustomerDetail, type CustomerContact, type CustomerAddress } from "@/api/customers"
import { invoicesApi } from "@/api/invoices"
import { STATUS_CONFIG as SHIPMENT_STATUS } from "@/api/shipments"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"
import { personaType, PERSONA_LABEL } from "@/lib/fiscal"

export const Route = createFileRoute("/customers/$id/")({
  component: CustomerDetailPage,
})

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline"

const CUSTOMER_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  prospect: { label: "Prospecto", variant: "outline" },
  active: { label: "Activo", variant: "success" },
  suspended: { label: "Suspendido", variant: "warning" },
  blocked: { label: "Bloqueado", variant: "destructive" },
  inactive: { label: "Inactivo", variant: "outline" },
}

const CUSTOMER_TYPE: Record<string, string> = {
  shipper: "Shipper", consignee: "Consignee", bill_to: "Bill-to",
  importer: "Importador", exporter: "Exportador", other: "Otro",
}

const CONTACT_TYPE: Record<string, string> = {
  operations: "Operaciones", billing: "Facturación", collections: "Cobranza",
  legal: "Legal", executive: "Ejecutivo", other: "Otro",
}

const ADDRESS_TYPE: Record<string, string> = {
  fiscal: "Fiscal", commercial: "Comercial", pickup: "Recolección", delivery: "Entrega",
  warehouse: "Bodega", plant: "Planta", port: "Puerto / terminal", other: "Otro",
}

const COMPLIANCE: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pendiente", variant: "warning" },
  complete: { label: "Completo", variant: "success" },
  expired: { label: "Vencido", variant: "destructive" },
  rejected: { label: "Rechazado", variant: "destructive" },
}

const DOCUMENTS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pendiente", variant: "warning" },
  complete: { label: "Completo", variant: "success" },
  expired: { label: "Vencido", variant: "destructive" },
}

const INVOICE_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

function money(value: string | number | null, currency = "MXN"): string {
  const n = typeof value === "string" ? parseFloat(value) : value
  if (n === null || Number.isNaN(n)) return "—"
  return n.toLocaleString("es-MX", { style: "currency", currency })
}

function CustomerDetailPage() {
  const { id } = Route.useParams()
  const { can } = useCan()
  const [tab, setTab] = useState("expedientes")

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: () => customersApi.get(id),
  })
  const { items: regimenItems } = useCatalog("sat_tax_regime")
  const { items: cfdiUseItems } = useCatalog("sat_cfdi_use")
  const { items: serviceTypes } = useCatalog("service_type")

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-[--color-muted-foreground]">Cargando...</div>
      </AppLayout>
    )
  }

  if (!customer) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Building2 className="h-12 w-12 opacity-30" />
          <p className="text-[--color-muted-foreground]">Cliente no encontrado</p>
          <Link to="/customers"><Button variant="outline">Volver</Button></Link>
        </div>
      </AppLayout>
    )
  }

  const c: CustomerDetail = customer
  const status = CUSTOMER_STATUS[c.status] ?? CUSTOMER_STATUS["prospect"]!
  const regimeExtra = regimenItems.find((r) => r.code === c.fiscalRegime)?.extra as { moral?: boolean; physical?: boolean } | null | undefined
  const persona = personaType(c.rfc, regimeExtra)
  const regimeLabel = regimenItems.find((r) => r.code === c.fiscalRegime)?.name
  const cfdiLabel = cfdiUseItems.find((u) => u.code === c.defaultCfdiUse)?.name
  const serviceLabel = (code: string) => serviceTypes.find((s) => s.code === code)?.name ?? code

  // Mínimo necesario para emitir un CFDI 4.0 al receptor
  const fiscallyComplete = Boolean(c.legalName && c.fiscalRegime && c.fiscalZipCode && c.defaultCfdiUse)

  const limit = c.creditLimit ? parseFloat(c.creditLimit) : null
  const exposure = parseFloat(c.billedExposure || "0")
  const available = limit !== null ? limit - exposure : null
  const overLimit = available !== null && available < 0

  const tabs: TabItem[] = [
    { id: "expedientes", label: "Expedientes", count: c.shipments.length, icon: <Package className="h-4 w-4" /> },
    { id: "facturas", label: "Facturas", count: c.invoices.length, icon: <FileText className="h-4 w-4" /> },
    { id: "documentos", label: "Documentos", icon: <FileText className="h-4 w-4" /> },
  ]

  const contacts = c.contacts ?? []
  const addresses = c.addresses ?? []

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/customers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{c.name}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant="outline">{CUSTOMER_TYPE[c.customerType] ?? c.customerType}</Badge>
            {!fiscallyComplete && <Badge variant="warning">Datos fiscales incompletos</Badge>}
          </div>
          {can("customers.write") && (
            <Link to="/customers/$id/edit" params={{ id }}>
              <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </Link>
          )}
        </div>
        {c.legalName && c.legalName !== c.name && (
          <p className="mt-1 text-sm text-[--color-muted-foreground]">{c.legalName}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Columna principal: actividad ── */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card className="min-w-0">
            <Tabs tabs={tabs} active={tab} onChange={setTab} className="px-2 pt-1" />
            <div className="p-4">
              {tab === "expedientes" && (
                c.shipments.length === 0 ? (
                  <Empty icon={<Package className="h-8 w-8 opacity-30" />} text="Sin expedientes" />
                ) : (
                  <ul className="divide-y divide-[--color-border]">
                    {c.shipments.map((s) => {
                      const st = SHIPMENT_STATUS[s.status as keyof typeof SHIPMENT_STATUS] ?? SHIPMENT_STATUS.draft
                      return (
                        <li key={s.id}>
                          <Link to="/shipments/$id" params={{ id: s.id }} className="flex items-center justify-between gap-3 py-2.5 hover:bg-[--color-muted]/40">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{s.folio}</span>
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </div>
                              <p className="truncate text-xs text-[--color-muted-foreground]">
                                {serviceLabel(s.operationType)}
                                {(s.origin || s.destination) && ` · ${[s.origin, s.destination].filter(Boolean).join(" → ")}`}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs text-[--color-muted-foreground]">{new Date(s.createdAt).toLocaleDateString("es-MX")}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}

              {tab === "facturas" && (
                c.invoices.length === 0 ? (
                  <Empty icon={<FileText className="h-8 w-8 opacity-30" />} text="Sin facturas" />
                ) : (
                  <ul className="divide-y divide-[--color-border]">
                    {c.invoices.map((inv) => {
                      const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS["draft"]!
                      return (
                        <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{inv.series}-{inv.folio}</span>
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </div>
                            <p className="text-xs text-[--color-muted-foreground]">
                              {new Date(inv.stampedAt ?? inv.createdAt).toLocaleDateString("es-MX")}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-sm font-medium">{money(inv.total, c.creditCurrency)}</span>
                            {inv.status === "stamped" && (
                              <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer" title="Descargar PDF"
                                 className="rounded p-1.5 text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground]">
                                <FileText className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}

              {tab === "documentos" && <DocumentsSection entityType="customer" entityId={id} bare />}
            </div>
          </Card>
        </div>

        {/* ── Columna lateral ── */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Crédito y comercial */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Crédito y comercial</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="Ejecutivo" value={c.salesOwner || "—"} />
              <Row label="Expedientes activos" value={String(c.activeShipments)} />
              <Row label="Límite de crédito" value={limit !== null ? money(limit, c.creditCurrency) : "Sin definir"} />
              <Row label="Días de crédito" value={c.creditTermsDays !== null ? `${c.creditTermsDays} días` : "—"} />
              <Row label="Facturado vigente" value={money(exposure, c.creditCurrency)} />
              {limit !== null && (
                <Row
                  label="Disponible"
                  value={<span className={overLimit ? "text-[--color-destructive]" : "text-green-600"}>{money(available, c.creditCurrency)}</span>}
                />
              )}
              <p className="mt-1 text-xs text-[--color-muted-foreground]">
                "Facturado vigente" suma facturas timbradas no canceladas; aún no descuenta pagos.
              </p>
            </CardContent>
          </Card>

          {/* Perfil fiscal */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Perfil fiscal</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="RFC" value={<span className="font-mono text-xs">{c.rfc}</span>} />
              {persona && <Row label="Persona" value={PERSONA_LABEL[persona]} />}
              <Row label="Régimen" value={regimeLabel ? <span className="text-right">{c.fiscalRegime} – {regimeLabel}</span> : (c.fiscalRegime || "—")} />
              <Row label="CP fiscal" value={c.fiscalZipCode || "—"} />
              <Row label="País fiscal" value={c.taxCountry} />
              {c.taxCountry !== "MX" && c.foreignTaxId && <Row label="Tax ID" value={c.foreignTaxId} />}
              <Row label="Uso CFDI default" value={cfdiLabel ? <span className="text-right">{c.defaultCfdiUse} – {cfdiLabel}</span> : (c.defaultCfdiUse || "—")} />
              <Row label="Método / forma" value={[c.defaultPaymentMethod, c.defaultPaymentForm].filter(Boolean).join(" · ") || "—"} />
            </CardContent>
          </Card>

          {/* Cumplimiento */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Cumplimiento / KYC</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="Cumplimiento fiscal" value={<Badge variant={(COMPLIANCE[c.complianceStatus] ?? COMPLIANCE.pending!).variant}>{(COMPLIANCE[c.complianceStatus] ?? COMPLIANCE.pending!).label}</Badge>} />
              <Row label="Documentación" value={<Badge variant={(DOCUMENTS[c.documentsStatus] ?? DOCUMENTS.pending!).variant}>{(DOCUMENTS[c.documentsStatus] ?? DOCUMENTS.pending!).label}</Badge>} />
            </CardContent>
          </Card>

          {/* Contactos */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Contactos</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {contacts.length === 0 ? (
                <p className="text-[--color-muted-foreground]">Sin contactos</p>
              ) : contacts.map((ct: CustomerContact, i) => (
                <div key={ct.id ?? i} className="flex flex-col gap-0.5 border-b border-[--color-border] pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{ct.name}</span>
                    {ct.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                    <Badge variant="outline">{CONTACT_TYPE[ct.type] ?? ct.type}</Badge>
                  </div>
                  {ct.position && <span className="text-xs text-[--color-muted-foreground]">{ct.position}</span>}
                  {ct.email && <span className="flex items-center gap-1.5 text-xs text-[--color-muted-foreground]"><Mail className="h-3 w-3" /> {ct.email}</span>}
                  {(ct.phone || ct.mobile) && <span className="flex items-center gap-1.5 text-xs text-[--color-muted-foreground]"><Phone className="h-3 w-3" /> {[ct.phone, ct.mobile].filter(Boolean).join(" · ")}</span>}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Direcciones */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Direcciones</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {addresses.length === 0 ? (
                <p className="text-[--color-muted-foreground]">Sin direcciones</p>
              ) : addresses.map((a: CustomerAddress, i) => (
                <div key={a.id ?? i} className="flex flex-col gap-0.5 border-b border-[--color-border] pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">{ADDRESS_TYPE[a.type] ?? a.type}</Badge>
                    {a.label && <span className="text-xs text-[--color-muted-foreground]">{a.label}</span>}
                    {a.isPrimary && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                  </div>
                  <span className="flex items-start gap-1.5 text-xs text-[--color-muted-foreground]">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {a.formatted ?? "—"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-[--color-muted-foreground]">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-[--color-muted-foreground]">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  )
}
