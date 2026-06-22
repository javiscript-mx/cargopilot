import { useMemo, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2, Search } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { vehiclesApi, VEHICLE_STATUS_LABELS, type VehicleStatus } from "@/api/vehicles"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"
import { validateRequired, collectErrors, scrollToFirstError } from "@/lib/validators"

const EMPTY = {
  plates: "", economicNumber: "", year: "", configVehicular: "",
  grossWeight: "", permSct: "", permSctNumber: "", insurer: "", insurancePolicy: "",
}

// A partir de cuántos registros mostramos el buscador
const SEARCH_THRESHOLD = 5

export function VehiclesSection({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canManage = can("suppliers.write")

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", supplierId],
    queryFn: () => vehiclesApi.list({ supplierId, active: true }),
  })
  const { simpleOptions: configOptions } = useCatalog("cp_config_vehicular")
  const { simpleOptions: permOptions } = useCatalog("cp_perm_sct")
  const configLabel = (code: string | null) =>
    code ? (configOptions.find((o) => o.value === code)?.label ?? code) : null

  const [show, setShow] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [search, setSearch] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vehicles
    return vehicles.filter((v) =>
      [v.plates, v.economicNumber, v.permSctNumber].some((f) => f?.toLowerCase().includes(q)),
    )
  }, [vehicles, search])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["vehicles", supplierId] })

  const createMutation = useMutation({
    mutationFn: () =>
      vehiclesApi.create({
        supplierId,
        plates: form.plates.trim().toUpperCase(),
        economicNumber: form.economicNumber || null,
        year: form.year ? parseInt(form.year, 10) : null,
        configVehicular: form.configVehicular || null,
        grossWeight: form.grossWeight ? parseFloat(form.grossWeight) : null,
        permSct: form.permSct || null,
        permSctNumber: form.permSctNumber || null,
        insurer: form.insurer || null,
        insurancePolicy: form.insurancePolicy || null,
      }),
    onSuccess: () => {
      invalidate(); setForm(EMPTY); setShow(false); setErrors({})
      toast.success("Unidad agregada")
    },
    onError: (err: Error) => toast.error("No se pudo agregar la unidad", err.message),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VehicleStatus }) => vehiclesApi.setStatus(id, status),
    onSuccess: (_, { status }) => {
      invalidate()
      toast.success("Estado de la unidad actualizado", VEHICLE_STATUS_LABELS[status].label)
    },
    onError: (err: Error) => toast.error("No se pudo actualizar la unidad", err.message),
  })
  const deleteMutation = useMutation({
    mutationFn: vehiclesApi.delete,
    onSuccess: () => { invalidate(); toast.success("Unidad dada de baja") },
    onError: (err: Error) => toast.error("No se pudo dar de baja la unidad", err.message),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({ plates: validateRequired(form.plates, "Placas") })
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
      {/* Barra de herramientas: buscador + alta */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {vehicles.length > SEARCH_THRESHOLD ? (
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por placas, alias o permiso..."
              className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
        ) : (
          <span className="text-sm text-[var(--color-muted-foreground)]">
            {vehicles.length} {vehicles.length === 1 ? "unidad registrada" : "unidades registradas"}
          </span>
        )}
        {canManage && (
          <Button size="sm" className="flex items-center gap-1.5" onClick={() => { setShow(true); setErrors({}) }}>
            <Plus className="h-3.5 w-3.5" /> Agregar unidad
          </Button>
        )}
      </div>

      <Drawer
        open={show}
        onClose={() => { setShow(false); setErrors({}) }}
        title="Nueva unidad"
        description="Datos del autotransporte para el complemento Carta Porte."
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { setShow(false); setErrors({}) }}>Cancelar</Button>
            <Button type="submit" form="vehicle-form" size="sm" loading={createMutation.isPending}>Guardar unidad</Button>
          </div>
        }
      >
        <form id="vehicle-form" onSubmit={handleAdd} className="flex flex-col gap-3">
          <Input id="plates" label="Placas" value={form.plates} onChange={set("plates")} placeholder="ABC1234" error={errors.plates} />
          <Input id="economicNumber" label="Número económico (alias)" value={form.economicNumber} onChange={set("economicNumber")} placeholder="U-01" />
          <Select id="configVehicular" label="Configuración vehicular" placeholder="Selecciona..." options={configOptions} value={form.configVehicular} onChange={set("configVehicular")} />
          <Input id="year" label="Año modelo" type="number" min="1900" max="2100" value={form.year} onChange={set("year")} />
          <Select id="permSct" label="Permiso SCT" placeholder="Selecciona..." options={permOptions} value={form.permSct} onChange={set("permSct")} />
          <Input id="permSctNumber" label="Número de permiso SCT" value={form.permSctNumber} onChange={set("permSctNumber")} />
          <Input id="grossWeight" label="Peso bruto vehicular (ton)" type="number" min="0" step="0.001" value={form.grossWeight} onChange={set("grossWeight")} />
          <Input id="insurer" label="Aseguradora (resp. civil)" value={form.insurer} onChange={set("insurer")} />
          <Input id="insurancePolicy" label="Póliza de seguro" value={form.insurancePolicy} onChange={set("insurancePolicy")} />
        </form>
      </Drawer>

      {vehicles.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin unidades registradas.</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">Sin resultados para la búsqueda.</p>
      ) : (
        <div className="flex max-h-[480px] flex-col divide-y divide-[var(--color-border)] overflow-y-auto">
          {filtered.map((v) => {
            const st = VEHICLE_STATUS_LABELS[v.status]
            return (
              <div key={v.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-medium">{v.plates}</span>
                    {v.economicNumber && <span className="text-sm text-[var(--color-muted-foreground)]">({v.economicNumber})</span>}
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-[var(--color-muted-foreground)]">
                    {configLabel(v.configVehicular) && <span>{configLabel(v.configVehicular)}</span>}
                    {v.year && <span>{v.year}</span>}
                    {v.permSctNumber && <span>Permiso: {v.permSctNumber}</span>}
                    {v.insurer && <span>{v.insurer}</span>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    {v.status !== "authorized" && (
                      <Button size="sm" variant="outline" loading={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: v.id, status: "authorized" })}>
                        Autorizar
                      </Button>
                    )}
                    {v.status === "authorized" && (
                      <Button size="sm" variant="outline"
                        onClick={() => statusMutation.mutate({ id: v.id, status: "suspended" })}>
                        Suspender
                      </Button>
                    )}
                    <button
                      title="Dar de baja"
                      onClick={async () => { if (await confirm(`¿Dar de baja la unidad ${v.plates}?`)) deleteMutation.mutate(v.id) }}
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
