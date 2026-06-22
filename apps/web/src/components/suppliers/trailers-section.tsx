import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Search } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trailersApi, TRAILER_STATUS_LABELS, type TrailerStatus } from "@/api/trailers"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { validateRequired, collectErrors, scrollToFirstError } from "@/lib/validators"

const EMPTY = { plate: "", subType: "", notes: "" }

// A partir de cuántos registros mostramos el buscador
const SEARCH_THRESHOLD = 5

export function TrailersSection({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canManage = can("suppliers.write")

  const { data: trailers = [] } = useQuery({
    queryKey: ["trailers", supplierId],
    queryFn: () => trailersApi.list({ supplierId, active: true }),
  })
  const { simpleOptions: subTypeOptions } = useCatalog("cp_subtipo_remolque")
  const subTypeLabel = (code: string | null) =>
    code ? (subTypeOptions.find((o) => o.value === code)?.label ?? code) : null

  const [show, setShow] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return trailers
    return trailers.filter((t) => [t.plate, t.subType].some((f) => f?.toLowerCase().includes(q)))
  }, [trailers, search])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["trailers", supplierId] })

  const createMutation = useMutation({
    mutationFn: () =>
      trailersApi.create({
        supplierId,
        plate: form.plate.trim().toUpperCase(),
        subType: form.subType || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      invalidate(); setForm(EMPTY); setShow(false); setErrors({})
      toast.success("Remolque agregado")
    },
    onError: (err: Error) => toast.error("No se pudo agregar el remolque", err.message),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TrailerStatus }) => trailersApi.setStatus(id, status),
    onSuccess: (_, { status }) => {
      invalidate()
      toast.success("Estado del remolque actualizado", TRAILER_STATUS_LABELS[status].label)
    },
    onError: (err: Error) => toast.error("No se pudo actualizar el remolque", err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: trailersApi.delete,
    onSuccess: () => { invalidate(); toast.success("Remolque dado de baja") },
    onError: (err: Error) => toast.error("No se pudo dar de baja el remolque", err.message),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({ plate: validateRequired(form.plate, "Placa") })
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
    setErrors({})
    createMutation.mutate()
  }
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {trailers.length > SEARCH_THRESHOLD ? (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por placa o subtipo..."
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        ) : (
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {trailers.length} {trailers.length === 1 ? "remolque registrado" : "remolques registrados"}
          </span>
        )}
        {canManage && (
          <Button size="sm" className="flex items-center gap-1.5" onClick={() => { setShow(true); setErrors({}) }}>
            <Plus className="h-3.5 w-3.5" /> Agregar remolque
          </Button>
        )}
      </div>

      <Drawer
        open={show}
        onClose={() => { setShow(false); setErrors({}) }}
        title="Nuevo remolque"
        description="Remolque / semirremolque para el nodo Remolques de la Carta Porte."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setShow(false); setErrors({}) }}>Cancelar</Button>
            <Button type="submit" form="trailer-form" size="sm" loading={createMutation.isPending}>Guardar remolque</Button>
          </div>
        }
      >
        <form id="trailer-form" onSubmit={handleAdd} className="flex flex-col gap-3">
          <Input id="plate" label="Placa" value={form.plate} onChange={set("plate")} placeholder="XYZ7890" error={errors.plate} />
          <Select id="subType" label="Subtipo de remolque (SAT)" placeholder="Selecciona..." options={subTypeOptions} value={form.subType} onChange={set("subType")} />
          <Input id="notes" label="Notas (opcional)" value={form.notes} onChange={set("notes")} />
        </form>
      </Drawer>

      {trailers.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin remolques registrados.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin resultados para la búsqueda.</p>
      ) : (
        <div className="flex max-h-[480px] flex-col divide-y divide-[var(--color-border)] overflow-y-auto">
          {filtered.map((t) => {
            const st = TRAILER_STATUS_LABELS[t.status]
            return (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-medium">{t.plate}</span>
                    {subTypeLabel(t.subType) && <span className="text-sm text-[var(--color-muted-foreground)]">{subTypeLabel(t.subType)}</span>}
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  {t.notes && <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{t.notes}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    {t.status !== "authorized" && (
                      <Button size="sm" variant="outline" loading={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: t.id, status: "authorized" })}>
                        Autorizar
                      </Button>
                    )}
                    {t.status === "authorized" && (
                      <Button size="sm" variant="outline"
                        onClick={() => statusMutation.mutate({ id: t.id, status: "suspended" })}>
                        Suspender
                      </Button>
                    )}
                    <button
                      title="Dar de baja"
                      onClick={async () => { if (await confirm(`¿Dar de baja el remolque ${t.plate}?`)) deleteMutation.mutate(t.id) }}
                      className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-red-50 hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
