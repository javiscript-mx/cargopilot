import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { Package, Plus, ArrowRight } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PaginationBar, SearchInput, PAGE_SIZE } from "@/components/ui/pagination"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { shipmentsApi, STATUS_CONFIG } from "@/api/shipments"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"

export const Route = createFileRoute("/shipments/")({
  component: ShipmentsPage,
})

function ShipmentsPage() {
  const { can } = useCan()
  const canWrite = can("shipments.write")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ["shipments", { page, search: debouncedSearch }],
    queryFn: () => shipmentsApi.listPaged({ page, pageSize: PAGE_SIZE, search: debouncedSearch }),
    placeholderData: keepPreviousData,
  })
  const shipments = data?.data ?? []
  const total = data?.total ?? 0

  const { items: operationTypes } = useCatalog("service_type")
  const opLabel = (code: string) => operationTypes.find((t) => t.code === code)?.name ?? code

  function onSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expedientes</h1>
          <p className="text-[--color-muted-foreground]">{total} operaciones en total</p>
        </div>
        {canWrite && (
          <Link to="/shipments/new" className="w-full sm:w-auto">
            <Button className="flex w-full items-center justify-center gap-2 sm:w-auto"><Plus className="h-4 w-4" /> Nuevo expediente</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar por folio, ruta, referencia o cliente..." />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : shipments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Package className="h-12 w-12 opacity-30" />
              <p>{debouncedSearch ? "Sin resultados para la búsqueda" : "No hay expedientes registrados"}</p>
              {!debouncedSearch && canWrite && <Link to="/shipments/new"><Button><Plus className="h-4 w-4" /> Crear primer expediente</Button></Link>}
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas apiladas */}
              <ul className="divide-y divide-[--color-border] md:hidden">
                {shipments.map((s) => {
                  const status = STATUS_CONFIG[s.status] ?? { label: s.status, variant: "outline" as const }
                  return (
                    <li key={s.id}>
                      <Link to="/shipments/$id" params={{ id: s.id }} className="block px-4 py-3 hover:bg-[--color-muted]/50">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono font-semibold text-[--color-primary]">{s.folio}</span>
                          <Badge variant={status.variant}>{status.label}</Badge>
                        </div>
                        <p className="mt-1 truncate font-medium">{s.customer.name}</p>
                        <p className="mt-0.5 truncate text-xs text-[--color-muted-foreground]">
                          {opLabel(s.operationType)}
                          {s.origin && s.destination ? ` · ${s.origin} → ${s.destination}` : s.reference ? ` · ${s.reference}` : ""}
                        </p>
                      </Link>
                    </li>
                  )
                })}
              </ul>

              {/* Desktop: tabla */}
              <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Folio</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Operación</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-[--color-muted-foreground] md:table-cell">Ruta / Referencia</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Estado</th>
                  <th className="hidden px-4 py-3 text-left font-medium text-[--color-muted-foreground] sm:table-cell">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => {
                  const status = STATUS_CONFIG[s.status] ?? { label: s.status, variant: "outline" as const }
                  return (
                    <tr key={s.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                      <td className="px-4 py-3">
                        <Link to="/shipments/$id" params={{ id: s.id }} className="font-mono font-semibold text-[--color-primary] hover:underline">
                          {s.folio}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.customer.name}</div>
                        <div className="text-xs text-[--color-muted-foreground]">{s.customer.rfc}</div>
                      </td>
                      <td className="px-4 py-3">{opLabel(s.operationType)}</td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {s.origin && s.destination ? (
                          <span className="flex items-center gap-1.5 text-[--color-muted-foreground]">
                            <span className="max-w-[140px] truncate">{s.origin}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span className="max-w-[140px] truncate">{s.destination}</span>
                          </span>
                        ) : s.reference ? (
                          <span className="font-mono text-xs text-[--color-muted-foreground]">{s.reference}</span>
                        ) : (
                          <span className="text-[--color-muted-foreground]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="hidden px-4 py-3 text-[--color-muted-foreground] sm:table-cell">
                        {new Date(s.createdAt).toLocaleDateString("es-MX")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </>
          )}
          {total > 0 && (
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          )}
        </CardContent>
      </Card>

    </AppLayout>
  )
}
