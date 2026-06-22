import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { ScrollText } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select } from "@/components/ui/select"
import { PaginationBar, SearchInput, PAGE_SIZE } from "@/components/ui/pagination"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { authClient } from "@/lib/auth-client"
import { roleHasPermission } from "@hm/shared"
import { auditApi, ACTION_LABELS, ENTITY_LABELS, type AuditAction } from "@/api/audit"

export const Route = createFileRoute("/audit")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role ?? ""
    if (!roleHasPermission(role, "audit.read")) throw redirect({ to: "/" })
  },
  component: AuditPage,
})

const ACTION_OPTIONS = [
  { value: "", label: "Todas las acciones" },
  { value: "create", label: "Creó" },
  { value: "update", label: "Actualizó" },
  { value: "delete", label: "Eliminó" },
]
const ENTITY_OPTIONS = [
  { value: "", label: "Todos los módulos" },
  ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
]

function AuditPage() {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [search, setSearch] = useState("")
  const [action, setAction] = useState<AuditAction | "">("")
  const [entityType, setEntityType] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const debounced = useDebouncedValue(search)

  const { data, isLoading } = useQuery({
    queryKey: ["audit", { page, pageSize, search: debounced, action, entityType, from, to }],
    queryFn: () => auditApi.listPaged({ page, pageSize, search: debounced, action, entityType, from, to }),
    placeholderData: keepPreviousData,
  })
  const rows = data?.data ?? []
  const total = data?.total ?? 0

  const reset = () => setPage(1)
  const fdate = (iso: string) => new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })

  return (
    <AppLayout>
      <div className="mb-5 flex items-center gap-2.5">
        <ScrollText className="h-6 w-6 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-xl font-bold">Auditoría</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Registro de todas las acciones de escritura, actualización y borrado.</p>
        </div>
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="min-w-0 flex-1 sm:max-w-xs"><SearchInput value={search} onChange={(v) => { setSearch(v); reset() }} placeholder="Usuario, correo o ruta..." /></div>
        <div className="w-44"><Select value={action} onChange={(e) => { setAction(e.target.value as AuditAction | ""); reset() }} options={ACTION_OPTIONS} /></div>
        <div className="w-48"><Select value={entityType} onChange={(e) => { setEntityType(e.target.value); reset() }} options={ENTITY_OPTIONS} /></div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset() }} className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
          <span>a</span>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); reset() }} className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Sin registros con esos filtros.</p>
        ) : (
          <>
            {/* Mobile: tarjetas */}
            <ul className="divide-y divide-[var(--color-border)] md:hidden">
              {rows.map((r) => {
                const a = ACTION_LABELS[r.action]
                return (
                  <li key={r.id} className="flex flex-col gap-1 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={a.variant}>{a.label}</Badge>
                      <span className="text-sm font-medium">{ENTITY_LABELS[r.entityType ?? ""] ?? r.entityType ?? "—"}</span>
                    </div>
                    <span className="text-xs text-[var(--color-muted-foreground)]">{r.userName ?? r.userEmail ?? "—"} · {fdate(r.createdAt)}</span>
                    <span className="truncate font-mono text-xs text-[var(--color-muted-foreground)]">{r.method} {r.path}</span>
                  </li>
                )
              })}
            </ul>
            {/* Desktop: tabla */}
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Usuario</th>
                  <th className="px-4 py-2.5 font-medium">Acción</th>
                  <th className="px-4 py-2.5 font-medium">Módulo</th>
                  <th className="px-4 py-2.5 font-medium">Ruta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((r) => {
                  const a = ACTION_LABELS[r.action]
                  return (
                    <tr key={r.id} className="hover:bg-[var(--color-muted)]/40">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-muted-foreground)]">{fdate(r.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.userName ?? "—"}</div>
                        <div className="text-xs text-[var(--color-muted-foreground)]">{r.userEmail}</div>
                      </td>
                      <td className="px-4 py-2.5"><Badge variant={a.variant}>{a.label}</Badge></td>
                      <td className="px-4 py-2.5">{ENTITY_LABELS[r.entityType ?? ""] ?? r.entityType ?? "—"}</td>
                      <td className="px-4 py-2.5"><span className="font-mono text-xs text-[var(--color-muted-foreground)]">{r.method} {r.path}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
        <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1) }} />
      </Card>
    </AppLayout>
  )
}
