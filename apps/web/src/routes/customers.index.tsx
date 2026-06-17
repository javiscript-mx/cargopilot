import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { Building2, Plus, Pencil } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PaginationBar, SearchInput, PAGE_SIZE } from "@/components/ui/pagination"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { customersApi } from "@/api/customers"

export const Route = createFileRoute("/customers/")({
  component: CustomersPage,
})

function CustomersPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ["customers", { page, search: debouncedSearch }],
    queryFn: () => customersApi.listPaged({ page, pageSize: PAGE_SIZE, search: debouncedSearch }),
    placeholderData: keepPreviousData,
  })
  const customers = data?.data ?? []
  const total = data?.total ?? 0

  function onSearch(value: string) {
    setSearch(value)
    setPage(1)
  }

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-[--color-muted-foreground]">{total} clientes registrados</p>
        </div>
        <Link to="/customers/new" className="w-full sm:w-auto">
          <Button className="flex w-full items-center justify-center gap-2 sm:w-auto"><Plus className="h-4 w-4" /> Nuevo cliente</Button>
        </Link>
      </div>

      <div className="mb-4">
        <SearchInput value={search} onChange={onSearch} placeholder="Buscar por nombre, RFC o correo..." />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-[--color-muted-foreground]">Cargando...</div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-[--color-muted-foreground]">
              <Building2 className="h-12 w-12 opacity-30" />
              <p>{debouncedSearch ? "Sin resultados para la búsqueda" : "No hay clientes registrados"}</p>
              {!debouncedSearch && <Link to="/customers/new"><Button><Plus className="h-4 w-4" /> Agregar primer cliente</Button></Link>}
            </div>
          ) : (
            <>
              {/* Mobile: tarjetas apiladas */}
              <ul className="divide-y divide-[--color-border] md:hidden">
                {customers.map((c) => (
                  <li key={c.id}>
                    <Link
                      to="/customers/$id/edit"
                      params={{ id: c.id }}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[--color-muted]/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="font-mono text-xs text-[--color-muted-foreground]">{c.rfc}</p>
                        {(c.email || c.phone) && (
                          <p className="mt-0.5 truncate text-xs text-[--color-muted-foreground]">
                            {[c.email, c.phone].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <Pencil className="h-4 w-4 shrink-0 text-[--color-muted-foreground]" />
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Desktop: tabla */}
              <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-[--color-border]">
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Nombre</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">RFC</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Correo</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Teléfono</th>
                  <th className="px-4 py-3 text-left font-medium text-[--color-muted-foreground]">Alta</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-[--color-border] last:border-0 hover:bg-[--color-muted]/50">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.rfc}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">{c.email ?? "—"}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-[--color-muted-foreground]">
                      {new Date(c.createdAt).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-4 py-3">
                      <Link to="/customers/$id/edit" params={{ id: c.id }}>
                        <Button variant="outline" size="sm" className="flex items-center gap-1">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
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
