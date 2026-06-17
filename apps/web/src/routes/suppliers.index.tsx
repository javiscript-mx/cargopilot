import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { Plus, Truck } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PaginationBar, SearchInput, PAGE_SIZE } from "@/components/ui/pagination"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { suppliersApi } from "@/api/suppliers"
import { useCatalog } from "@/hooks/use-catalog"

export const Route = createFileRoute("/suppliers/")({
  component: SuppliersPage,
})

const TYPE_COLORS: Record<string, string> = {
  carrier: "bg-blue-100 text-blue-800",
  customs: "bg-purple-100 text-purple-800",
  warehouse: "bg-yellow-100 text-yellow-800",
  airline: "bg-sky-100 text-sky-800",
  shipping_line: "bg-teal-100 text-teal-800",
  other: "bg-gray-100 text-gray-700",
}

function SuppliersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ["suppliers", { page, search: debouncedSearch }],
    queryFn: () => suppliersApi.listPaged({ page, pageSize: PAGE_SIZE, search: debouncedSearch }),
    placeholderData: keepPreviousData,
  })
  const suppliers = data?.data ?? []
  const total = data?.total ?? 0

  const { items: supplierTypes } = useCatalog("supplier_type")
  const typeLabel = (code: string) =>
    supplierTypes.find((t) => t.code === code)?.name ?? code

  function onSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proveedores</h1>
          <p className="text-[--color-muted-foreground]">{total} proveedores registrados</p>
        </div>
        <Link to="/suppliers/new" className="w-full sm:w-auto">
          <Button className="flex w-full items-center justify-center gap-2 sm:w-auto">
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar por nombre, RFC o contacto..." />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Truck className="h-12 w-12 opacity-30" />
              <p>{debouncedSearch ? "Sin resultados para la búsqueda" : "No hay proveedores registrados"}</p>
              {!debouncedSearch && (
                <Link to="/suppliers/new"><Button><Plus className="h-4 w-4" /> Agregar primer proveedor</Button></Link>
              )}
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas apiladas */}
              <ul className="divide-y divide-[--color-border] md:hidden">
                {suppliers.map((s) => (
                  <li key={s.id}>
                    <Link
                      to="/suppliers/$id"
                      params={{ id: s.id }}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[--color-muted]/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[--color-primary]">{s.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[s.type] ?? TYPE_COLORS["other"]}`}>
                            {typeLabel(s.type)}
                          </span>
                          {s.rfc && <span className="font-mono text-xs text-[--color-muted-foreground]">{s.rfc}</span>}
                        </div>
                      </div>
                      <Badge variant={s.active ? "success" : "outline"}>{s.active ? "Activo" : "Inactivo"}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabla */}
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-[--color-border]">
                    <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Nombre</th>
                    <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">RFC</th>
                    <th className="hidden px-4 py-3 text-left font-medium text-[--color-muted-foreground] lg:table-cell">Contacto</th>
                    <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s) => (
                    <tr key={s.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                      <td className="px-4 py-3">
                        <Link to="/suppliers/$id" params={{ id: s.id }} className="font-medium text-[--color-primary] hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[s.type] ?? TYPE_COLORS["other"]}`}>
                          {typeLabel(s.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[--color-muted-foreground]">{s.rfc ?? "—"}</td>
                      <td className="hidden px-4 py-3 text-[--color-muted-foreground] lg:table-cell">
                        <div>{s.contact ?? "—"}</div>
                        {(s.phone || s.email) && (
                          <div className="text-xs">{[s.phone, s.email].filter(Boolean).join(" · ")}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.active ? "success" : "outline"}>{s.active ? "Activo" : "Inactivo"}</Badge>
                      </td>
                    </tr>
                  ))}
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
