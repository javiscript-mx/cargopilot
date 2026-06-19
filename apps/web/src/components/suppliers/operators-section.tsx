import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Search } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { operatorsApi, OPERATOR_STATUS_LABELS, type OperatorStatus } from "@/api/operators"
import { useCan } from "@/lib/permissions"
import { useToast } from "@/components/ui/toast"

const EMPTY = { name: "", rfc: "", licenseNumber: "" }

// A partir de cuántos registros mostramos el buscador
const SEARCH_THRESHOLD = 5

export function OperatorsSection({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canManage = can("suppliers.write")

  const { data: operators = [] } = useQuery({
    queryKey: ["operators", supplierId],
    queryFn: () => operatorsApi.list({ supplierId, active: true }),
  })

  const [show, setShow] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return operators
    return operators.filter((o) =>
      [o.name, o.rfc, o.licenseNumber].some((f) => f?.toLowerCase().includes(q)),
    )
  }, [operators, search])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["operators", supplierId] })

  const createMutation = useMutation({
    mutationFn: () =>
      operatorsApi.create({
        supplierId,
        name: form.name.trim(),
        rfc: form.rfc.trim().toUpperCase() || null,
        licenseNumber: form.licenseNumber || null,
      }),
    onSuccess: () => {
      invalidate(); setForm(EMPTY); setShow(false); setError("")
      toast.success("Operador agregado")
    },
    onError: (err: Error) => setError(err.message),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OperatorStatus }) => operatorsApi.setStatus(id, status),
    onSuccess: (_, { status }) => {
      invalidate()
      toast.success("Estado del operador actualizado", OPERATOR_STATUS_LABELS[status].label)
    },
    onError: (err: Error) => toast.error("No se pudo actualizar el operador", err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: operatorsApi.delete,
    onSuccess: () => { invalidate(); toast.success("Operador dado de baja") },
    onError: (err: Error) => toast.error("No se pudo dar de baja al operador", err.message),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (form.name.trim().length < 2) { setError("El nombre es obligatorio"); return }
    createMutation.mutate()
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex flex-col gap-3">
      {/* Barra de herramientas: buscador + alta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {operators.length > SEARCH_THRESHOLD ? (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--color-muted-foreground]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, RFC o licencia..."
              className="w-full rounded-md border border-[--color-border] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-primary]"
            />
          </div>
        ) : (
          <span className="text-sm text-[--color-muted-foreground]">
            {operators.length} {operators.length === 1 ? "operador registrado" : "operadores registrados"}
          </span>
        )}
        <Button size="sm" className="flex items-center gap-1.5" onClick={() => { setShow(true); setError("") }}>
          <Plus className="h-3.5 w-3.5" /> Agregar operador
        </Button>
      </div>

      <Drawer
        open={show}
        onClose={() => { setShow(false); setError("") }}
        title="Nuevo operador"
        description="Figura de transporte para el complemento Carta Porte."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setShow(false); setError("") }}>Cancelar</Button>
            <Button type="submit" form="operator-form" size="sm" loading={createMutation.isPending}>Guardar operador</Button>
          </div>
        }
      >
        <form id="operator-form" onSubmit={handleAdd} className="flex flex-col gap-3">
          <Input id="opname" label="Nombre" value={form.name} onChange={set("name")} />
          <Input id="oprfc" label="RFC (opcional)" value={form.rfc} onChange={set("rfc")} maxLength={13} placeholder="ABC010101XYZ" />
          <Input id="oplic" label="Número de licencia" value={form.licenseNumber} onChange={set("licenseNumber")} />
          {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
        </form>
      </Drawer>

      {operators.length === 0 ? (
        <p className="py-6 text-center text-sm text-[--color-muted-foreground]">Sin operadores registrados.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-[--color-muted-foreground]">Sin resultados para la búsqueda.</p>
      ) : (
        <div className="flex max-h-[480px] flex-col divide-y divide-[--color-border] overflow-y-auto">
          {filtered.map((o) => {
            const st = OPERATOR_STATUS_LABELS[o.status]
            return (
              <div key={o.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{o.name}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[--color-muted-foreground]">
                    {o.rfc && <span>RFC: {o.rfc}</span>}
                    {o.licenseNumber && <span>Licencia: {o.licenseNumber}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {isAdmin && o.status !== "authorized" && (
                    <Button size="sm" variant="outline" loading={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: o.id, status: "authorized" })}>
                      Autorizar
                    </Button>
                  )}
                  {isAdmin && o.status === "authorized" && (
                    <Button size="sm" variant="outline"
                      onClick={() => statusMutation.mutate({ id: o.id, status: "suspended" })}>
                      Suspender
                    </Button>
                  )}
                  <button
                    title="Dar de baja"
                    onClick={() => { if (confirm(`¿Dar de baja al operador ${o.name}?`)) deleteMutation.mutate(o.id) }}
                    className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
