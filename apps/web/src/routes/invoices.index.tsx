import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { FileText, Plus, Download, FileCode, Ban } from "lucide-react"
import { useState } from "react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PaginationBar, SearchInput, PAGE_SIZE } from "@/components/ui/pagination"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { StampDialog } from "@/components/invoices/stamp-dialog"
import { CancelDialog } from "@/components/invoices/cancel-dialog"
import { invoicesApi, type Invoice, type InvoiceStatus } from "@/api/invoices"
import { useCan } from "@/lib/permissions"

export const Route = createFileRoute("/invoices/")({
  component: InvoicesPage,
})

const statusConfig: Record<InvoiceStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  stamped: { label: "Timbrada", variant: "success" },
  cancelled: { label: "Cancelada", variant: "destructive" },
}

function InvoicesPage() {
  const { can } = useCan()
  const canCreate = can("invoices.create")
  const canStamp = can("invoices.stamp")
  const canCancel = can("invoices.cancel")
  const [stampTarget, setStampTarget] = useState<Invoice | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", { page, pageSize, search: debouncedSearch }],
    queryFn: () => invoicesApi.listPaged({ page, pageSize, search: debouncedSearch }),
    placeholderData: keepPreviousData,
  })
  const invoices = data?.data ?? []
  const total = data?.total ?? 0

  function onSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Facturas</h1>
          <p className="text-[var(--color-muted-foreground)]">{total} facturas en total</p>
        </div>
        {canCreate && (
          <Link to="/invoices/new" className="w-full sm:w-auto">
            <Button className="flex w-full items-center justify-center gap-2 sm:w-auto"><Plus className="h-4 w-4" /> Nueva factura</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar por folio, serie o cliente..." />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[var(--color-muted-foreground)]">Cargando...</div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--color-muted-foreground)]">
              <FileText className="h-12 w-12 opacity-30" />
              <p>{debouncedSearch ? "Sin resultados para la búsqueda" : "No hay facturas registradas"}</p>
              {!debouncedSearch && canCreate && <Link to="/invoices/new"><Button><Plus className="h-4 w-4" /> Crear primera factura</Button></Link>}
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas apiladas */}
              <ul className="divide-y divide-[var(--color-border)] md:hidden">
                {invoices.map((inv) => {
                  const status = statusConfig[inv.status] ?? { label: inv.status, variant: "outline" as const }
                  return (
                    <li key={inv.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <Link to="/invoices/$id" params={{ id: inv.id }} className="font-mono font-semibold hover:text-[var(--color-primary)] hover:underline">{inv.series}-{inv.folio}</Link>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <p className="mt-1 truncate font-medium">{inv.customer.name}</p>
                      <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{inv.customer.rfc}</p>
                      <div className="mt-1 flex items-center justify-between gap-3">
                        <span className="text-xs text-[var(--color-muted-foreground)]">{new Date(inv.createdAt).toLocaleDateString("es-MX")}</span>
                        <span className="font-semibold">${parseFloat(inv.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</span>
                      </div>
                      {(inv.status === "draft" || inv.status === "stamped") && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {inv.status === "draft" && canStamp && (
                            <Button size="sm" variant="outline" onClick={() => setStampTarget(inv)}>Timbrar</Button>
                          )}
                          {inv.status === "stamped" && (
                            <>
                              <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline" className="flex items-center gap-1"><Download className="h-3.5 w-3.5" /> PDF</Button>
                              </a>
                              <a href={invoicesApi.xmlUrl(inv.id)} target="_blank" rel="noreferrer">
                                <Button size="sm" variant="outline" className="flex items-center gap-1"><FileCode className="h-3.5 w-3.5" /> XML</Button>
                              </a>
                              {canCancel && (
                                <Button size="sm" variant="outline" className="flex items-center gap-1 text-[var(--color-destructive)] hover:bg-red-50" onClick={() => setCancelTarget(inv)}>
                                  <Ban className="h-3.5 w-3.5" /> Cancelar
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: tabla */}
              <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Cliente</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Subtotal</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">IVA</th>
                  <th className="px-4 py-3 text-right font-medium text-[var(--color-muted-foreground)]">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Estado</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Fecha</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = statusConfig[inv.status] ?? { label: inv.status, variant: "outline" as const }
                  return (
                    <tr key={inv.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/50">
                      <td className="px-4 py-3 font-mono font-semibold">
                        <Link to="/invoices/$id" params={{ id: inv.id }} className="hover:text-[var(--color-primary)] hover:underline">{inv.series}-{inv.folio}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{inv.customer.name}</div>
                        <div className="text-xs text-[var(--color-muted-foreground)]">{inv.customer.rfc}</div>
                      </td>
                      <td className="px-4 py-3 text-right">${parseFloat(inv.subtotal).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">${parseFloat(inv.tax).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-semibold">${parseFloat(inv.total).toLocaleString("es-MX", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="px-4 py-3 text-[var(--color-muted-foreground)]">
                        {new Date(inv.createdAt).toLocaleDateString("es-MX")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {inv.status === "draft" && canStamp && (
                            <Button size="sm" variant="outline" onClick={() => setStampTarget(inv)}>
                              Timbrar
                            </Button>
                          )}
                          {inv.status === "stamped" && (
                            <>
                              <a href={invoicesApi.pdfUrl(inv.id)} target="_blank" rel="noreferrer" title="Descargar PDF">
                                <Button size="sm" variant="ghost"><Download className="h-4 w-4" /></Button>
                              </a>
                              <a href={invoicesApi.xmlUrl(inv.id)} target="_blank" rel="noreferrer" title="Descargar XML">
                                <Button size="sm" variant="ghost"><FileCode className="h-4 w-4" /></Button>
                              </a>
                              {canCancel && (
                                <Button
                                  size="sm" variant="ghost"
                                  title="Cancelar factura"
                                  className="text-[var(--color-destructive)] hover:bg-red-50"
                                  onClick={() => setCancelTarget(inv)}
                                >
                                  <Ban className="h-4 w-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </>
          )}
          {total > 0 && (
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }} />
          )}
        </CardContent>
      </Card>

      <StampDialog invoice={stampTarget} onClose={() => setStampTarget(null)} />
      <CancelDialog invoice={cancelTarget} onClose={() => setCancelTarget(null)} />
    </AppLayout>
  )
}
