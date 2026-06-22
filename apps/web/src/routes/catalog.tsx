import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Pencil, Trash2, BookOpen, Search, AlertTriangle } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { catalogApi, CATALOG_CATEGORY_LABELS, CATALOG_GROUPS, type CatalogCategory, type CatalogItem } from "@/api/catalog"
import { authClient } from "@/lib/auth-client"
import { validateCatalogCode, validateRequired, collectErrors, scrollToFirstError } from "@/lib/validators"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"

export const Route = createFileRoute("/catalog")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role
    if (role !== "admin") throw redirect({ to: "/" })
  },
  component: CatalogPage,
})

// Las categorías SAT son normativas — se advierte antes de editarlas
const SAT_CATEGORIES = new Set(["sat_product_key", "sat_unit_key", "sat_cfdi_use", "sat_payment_form", "sat_payment_method"])

const CATEGORY_HINTS: Record<string, string> = {
  supplier_type:      "Clasifica a tus proveedores (transportistas, navieras, agentes aduanales...). Se usa al dar de alta un proveedor.",
  service_type:       "Tipos de servicio que ofrece tu operación (importación, exportación...).",
  transport_mode:     "Modos de transporte disponibles para los expedientes.",
  cargo_type:         "Modalidad de la carga del expediente (suelta, contenerizada, granel...).",
  container_type:     "Tipos de contenedor ISO (20', 40', High Cube, Reefer...) para la modalidad contenerizada.",
  incoterm:           "Términos de comercio internacional (Incoterms 2020).",
  port:               "Puertos, aeropuertos y cruces que usas con frecuencia.",
  milestone:          "Hitos que el operador registra en la bitácora de un expediente (arribo a puerto, liberación aduanal, servicio completado...).",
  sat_product_key:    "Claves de producto/servicio del SAT para los conceptos de factura.",
  sat_unit_key:       "Claves de unidad de medida del SAT.",
  sat_cfdi_use:       "Usos de CFDI que puede declarar el receptor.",
  sat_payment_form:   "Formas de pago reconocidas por el SAT.",
  sat_payment_method: "PUE (una exhibición) o PPD (parcialidades).",
  sat_tax_regime:     "Regímenes fiscales del SAT (c_RegimenFiscal) para emisor y receptor.",
  sat_cfdi_type:      "Tipo de comprobante (Ingreso, Egreso, Traslado, Pago, Nómina).",
  cp_config_vehicular: "Configuración vehicular SAT (C2, C3, T3S2...) para el complemento Carta Porte.",
  cp_perm_sct: "Tipo de permiso SCT/SICT del autotransporte (TPAF01...) para Carta Porte.",
}

const EMPTY_FORM = { code: "", name: "", autotransporte: false }

function CatalogPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [activeCategory, setActiveCategory] = useState<CatalogCategory>("supplier_type")
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Todos los ítems de una vez — permite mostrar conteos por categoría
  const { data: allItems = [], isLoading } = useQuery({
    queryKey: ["catalog", "all"],
    queryFn: () => catalogApi.listItems(undefined, false),
  })

  const countByCategory = allItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1
    return acc
  }, {})

  const items = allItems
    .filter((i) => i.category === activeCategory)
    .filter((i) =>
      !search.trim() ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.code.toLowerCase().includes(search.toLowerCase()),
    )

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["catalog"] })

  const createMutation = useMutation({
    mutationFn: (data: Omit<CatalogItem, "id" | "createdAt">) => catalogApi.createItem(data),
    onSuccess: () => {
      invalidate()
      setForm(EMPTY_FORM)
      setShowForm(false)
      setErrors({})
      toast.success("Elemento agregado al catálogo")
    },
    onError: (err: Error) => toast.error("No se pudo agregar el elemento", err.message),
  })

  // Editar = baja lógica + alta nueva (vía API)
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CatalogItem> }) =>
      catalogApi.updateItem(id, data),
    onSuccess: () => {
      invalidate()
      setEditingItem(null)
      toast.success("Elemento actualizado")
    },
    onError: (err: Error) => toast.error("No se pudo actualizar el elemento", err.message),
  })

  // Activar / desactivar (baja lógica)
  const setActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      catalogApi.setActive(id, active),
    onSuccess: (_, { active }) => {
      invalidate()
      toast.success(active ? "Elemento reactivado" : "Elemento desactivado")
    },
    onError: (err: Error) => toast.error("No se pudo cambiar el estado", err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: catalogApi.deleteItem,
    onSuccess: () => {
      invalidate()
      toast.success("Elemento dado de baja")
    },
    onError: (err: Error) => toast.error("No se pudo dar de baja el elemento", err.message),
  })

  function selectCategory(cat: CatalogCategory) {
    setActiveCategory(cat)
    setShowForm(false)
    setSearch("")
    setErrors({})
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      code: validateCatalogCode(form.code),
      name: validateRequired(form.name, "Nombre"),
    })
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      scrollToFirstError()
      return
    }
    const extra = activeCategory === "supplier_type" && form.autotransporte ? { autotransporte: true } : null
    createMutation.mutate({ category: activeCategory, code: form.code, name: form.name, active: true, extra })
  }

  const isSat = SAT_CATEGORIES.has(activeCategory)
  const isSupplierType = activeCategory === "supplier_type"

  // Opciones para el selector mobile
  const mobileOptions = CATALOG_GROUPS.flatMap((g) =>
    g.categories.map((cat) => ({
      value: cat,
      label: `${g.label} · ${CATALOG_CATEGORY_LABELS[cat]} (${countByCategory[cat] ?? 0})`,
    })),
  )

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <BookOpen className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        <div>
          <h1 className="text-2xl font-bold">Catálogos</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Las opciones que aparecen en los formularios del sistema
          </p>
        </div>
      </div>

      {/* Selector de categoría en mobile */}
      <div className="mb-4 lg:hidden">
        <Select
          id="mobileCategory"
          options={mobileOptions}
          value={activeCategory}
          onChange={(e) => selectCategory(e.target.value as CatalogCategory)}
        />
      </div>

      <div className="flex gap-6">
        {/* ── Menú lateral de categorías (desktop) ── */}
        <nav className="hidden w-64 shrink-0 flex-col gap-5 lg:flex">
          {CATALOG_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.categories.map((cat) => {
                  const isActive = activeCategory === cat
                  return (
                    <button
                      key={cat}
                      onClick={() => selectCategory(cat as CatalogCategory)}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                        isActive
                          ? "bg-[var(--color-primary)] font-medium text-white"
                          : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                      )}
                    >
                      <span>{CATALOG_CATEGORY_LABELS[cat]}</span>
                      <span
                        className={cn(
                          "ml-2 rounded-full px-2 py-0.5 text-xs tabular-nums",
                          isActive ? "bg-white/20 text-white" : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                        )}
                      >
                        {countByCategory[cat] ?? 0}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Panel de la categoría seleccionada ── */}
        <div className="min-w-0 flex-1">
          <Card>
            <CardContent className="p-0">
              {/* Encabezado del panel */}
              <div className="border-b border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{CATALOG_CATEGORY_LABELS[activeCategory]}</h2>
                    <p className="mt-0.5 max-w-xl text-sm text-[var(--color-muted-foreground)]">
                      {CATEGORY_HINTS[activeCategory]}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="flex shrink-0 items-center gap-1.5"
                    onClick={() => { setShowForm((v) => !v); setErrors({}) }}
                  >
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                </div>

                {isSat && (
                  <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Catálogo normativo del SAT — modifícalo solo si el SAT publica cambios.
                  </div>
                )}

                {/* Formulario de alta */}
                {showForm && (
                  <form onSubmit={handleSave} className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
                      <Input
                        id="code" label="Código"
                        value={form.code}
                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                        error={errors["code"]} placeholder="CODIGO" maxLength={30}
                      />
                      <Input
                        id="name" label="Nombre"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        error={errors["name"]} placeholder="Descripción visible en los formularios"
                      />
                    </div>
                    {isSupplierType && (
                      <label className="mt-3 flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)]"
                          checked={form.autotransporte}
                          onChange={(e) => setForm((f) => ({ ...f, autotransporte: e.target.checked }))}
                        />
                        <span>
                          Usa autotransporte (Carta Porte)
                          <span className="block text-xs text-[var(--color-muted-foreground)]">
                            Los proveedores de este tipo capturarán Unidades y Operadores. Marca solo transportistas terrestres.
                          </span>
                        </span>
                      </label>
                    )}
                    <div className="mt-3 flex gap-2">
                      <Button type="submit" size="sm" loading={createMutation.isPending}>Guardar</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => { setShowForm(false); setErrors({}) }}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}

                {/* Buscador */}
                <div className="relative mt-4">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por código o nombre..."
                    className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>

              {/* Tabla de ítems */}
              {isLoading ? (
                <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">Cargando...</p>
              ) : items.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
                  {search ? "Sin resultados para la búsqueda." : "No hay elementos en esta categoría."}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
                      <th className="px-4 py-2.5 font-medium">Código</th>
                      <th className="px-4 py-2.5 font-medium">Nombre</th>
                      {isSupplierType && <th className="px-4 py-2.5 font-medium">Autotransporte</th>}
                      <th className="px-4 py-2.5 font-medium">Estado</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/40",
                          !item.active && "opacity-50",
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-[var(--color-muted)] px-2 py-0.5 font-mono text-xs font-medium">
                            {item.code}
                          </span>
                        </td>
                        <td className="w-full px-4 py-2.5">
                          {editingItem?.id === item.id ? (
                            <input
                              autoFocus
                              defaultValue={item.name}
                              className="w-full rounded border border-[var(--color-primary)] px-2 py-1 text-sm focus:outline-none"
                              onBlur={(e) => {
                                const name = e.target.value.trim()
                                if (name && name !== item.name) updateMutation.mutate({ id: item.id, data: { name } })
                                setEditingItem(null)
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                                if (e.key === "Escape") setEditingItem(null)
                              }}
                            />
                          ) : (
                            item.name
                          )}
                        </td>
                        {isSupplierType && (
                          <td className="px-4 py-2.5">
                            {(() => {
                              const on = (item.extra as { autotransporte?: boolean } | null)?.autotransporte === true
                              return (
                                <button
                                  title={on ? "Quitar autotransporte — dejará de mostrar Unidades/Operadores" : "Marcar como autotransporte — mostrará Unidades/Operadores"}
                                  onClick={() => updateMutation.mutate({ id: item.id, data: { extra: { autotransporte: !on } } })}
                                >
                                  <Badge variant={on ? "success" : "outline"}>{on ? "Sí" : "No"}</Badge>
                                </button>
                              )
                            })()}
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <Badge variant={item.active ? "success" : "outline"}>
                            {item.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Editar nombre"
                              onClick={() => setEditingItem(item)}
                              className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              title={item.active ? "Desactivar — deja de aparecer en formularios" : "Reactivar"}
                              onClick={() => setActiveMutation.mutate({ id: item.id, active: !item.active })}
                              className="whitespace-nowrap rounded px-2 py-1 text-xs text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                            >
                              {item.active ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              title="Dar de baja (baja lógica — conserva el histórico)"
                              onClick={async () => {
                                if (await confirm(`¿Dar de baja "${item.name}"? Queda inactivo y deja de aparecer en formularios, pero se conserva en el histórico.`))
                                  deleteMutation.mutate(item.id)
                              }}
                              className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-red-50 hover:text-[var(--color-destructive)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
