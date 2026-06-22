import { useState } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Pencil, Trash2, Truck, User, FileText, Container as ContainerIcon, Wallet } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, type TabItem } from "@/components/ui/tabs"
import { DocumentsSection } from "@/components/ui/documents-section"
import { VehiclesSection } from "@/components/suppliers/vehicles-section"
import { OperatorsSection } from "@/components/suppliers/operators-section"
import { TrailersSection } from "@/components/suppliers/trailers-section"
import { PayablesSection } from "@/components/suppliers/payables-section"
import { suppliersApi } from "@/api/suppliers"
import { vehiclesApi } from "@/api/vehicles"
import { operatorsApi } from "@/api/operators"
import { trailersApi } from "@/api/trailers"
import { documentsApi } from "@/api/documents"
import { useCatalog } from "@/hooks/use-catalog"
import { useCan } from "@/lib/permissions"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"

export const Route = createFileRoute("/suppliers/$id")({
  component: SupplierDetailPage,
})

function SupplierDetailPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { can } = useCan()
  const canWrite = can("suppliers.write")
  const canDelete = can("suppliers.delete")

  const { data: supplier, isLoading } = useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => suppliersApi.get(id),
  })
  const { items: supplierTypes } = useCatalog("supplier_type")
  const typeItem = supplierTypes.find((t) => t.code === supplier?.type)
  const typeLabel = (code: string) => supplierTypes.find((t) => t.code === code)?.name ?? code
  // Unidades y Operadores (bloques de Carta Porte) solo aplican a tipos marcados
  // como autotransporte en el catálogo — p. ej. transportista terrestre.
  const usesAutotransporte = (typeItem?.extra as { autotransporte?: boolean } | null)?.autotransporte === true

  // Contadores en vivo para las pestañas (mismas queryKeys que cada sección → react-query las deduplica)
  const [tab, setTab] = useState("unidades")
  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles", id],
    queryFn: () => vehiclesApi.list({ supplierId: id, active: true }),
    enabled: usesAutotransporte,
  })
  const { data: operators = [] } = useQuery({
    queryKey: ["operators", id],
    queryFn: () => operatorsApi.list({ supplierId: id, active: true }),
    enabled: usesAutotransporte,
  })
  const { data: trailers = [] } = useQuery({
    queryKey: ["trailers", id],
    queryFn: () => trailersApi.list({ supplierId: id, active: true }),
    enabled: usesAutotransporte,
  })
  const { data: documents = [] } = useQuery({
    queryKey: ["documents", "supplier", id],
    queryFn: () => documentsApi.list("supplier", id),
  })

  const deleteMutation = useMutation({
    mutationFn: () => suppliersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      toast.success("Proveedor desactivado", supplier?.name)
      navigate({ to: "/suppliers" })
    },
    onError: (err: Error) => toast.error("No se pudo desactivar el proveedor", err.message),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => suppliersApi.update(id, { active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppliers"] })
      queryClient.invalidateQueries({ queryKey: ["suppliers", id] })
      toast.success("Proveedor reactivado", supplier?.name)
    },
    onError: (err: Error) => toast.error("No se pudo reactivar el proveedor", err.message),
  })

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-[var(--color-muted-foreground)]">Cargando...</div>
      </AppLayout>
    )
  }

  if (!supplier) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Truck className="h-12 w-12 opacity-30" />
          <p className="text-[var(--color-muted-foreground)]">Proveedor no encontrado</p>
          <Link to="/suppliers"><Button variant="outline">Volver</Button></Link>
        </div>
      </AppLayout>
    )
  }

  const address = (supplier.address as { formatted?: string } | null)?.formatted

  const tabs: TabItem[] = [
    ...(usesAutotransporte ? [
      { id: "unidades", label: "Unidades", count: vehicles.length, icon: <Truck className="h-4 w-4" /> },
      { id: "operadores", label: "Operadores", count: operators.length, icon: <User className="h-4 w-4" /> },
      { id: "remolques", label: "Remolques", count: trailers.length, icon: <ContainerIcon className="h-4 w-4" /> },
    ] : []),
    { id: "por_pagar", label: "Por pagar", icon: <Wallet className="h-4 w-4" /> },
    { id: "documentos", label: "Documentos", count: documents.length, icon: <FileText className="h-4 w-4" /> },
  ]
  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]!.id

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/suppliers" className="mb-4 flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="h-4 w-4" /> Proveedores
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{supplier.name}</h1>
            <Badge variant="default">{typeLabel(supplier.type)}</Badge>
            {!supplier.active && <Badge variant="outline">Inactivo</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite && (
              <Link to="/suppliers/$id/edit" params={{ id }}>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              </Link>
            )}
            {canDelete && (supplier.active ? (
              <Button
                variant="outline" size="sm"
                className="flex items-center gap-1.5 text-[var(--color-destructive)] hover:bg-red-50"
                loading={deleteMutation.isPending}
                onClick={async () => {
                  if (await confirm(`¿Desactivar proveedor "${supplier.name}"? Se conserva su historial.`)) deleteMutation.mutate()
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Desactivar
              </Button>
            ) : (
              <Button
                variant="outline" size="sm"
                className="flex items-center gap-1.5"
                loading={reactivateMutation.isPending}
                onClick={() => reactivateMutation.mutate()}
              >
                Reactivar
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Columna principal ── */}
        {/* Autotransporte: pestañas Unidades · Operadores · Documentos (la página no crece con la suma). */}
        {/* Otros tipos: solo Documentos. */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <Card className="min-w-0">
            <Tabs tabs={tabs} active={activeTab} onChange={setTab} className="px-2 pt-1" />
            <div className="p-4">
              {activeTab === "unidades" && <VehiclesSection supplierId={id} />}
              {activeTab === "operadores" && <OperatorsSection supplierId={id} />}
              {activeTab === "remolques" && <TrailersSection supplierId={id} />}
              {activeTab === "por_pagar" && <PayablesSection supplierId={id} />}
              {activeTab === "documentos" && <DocumentsSection entityType="supplier" entityId={id} bare />}
            </div>
          </Card>
        </div>

        {/* ── Columna lateral: datos del proveedor ── */}
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Datos del proveedor</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2.5 text-sm">
              <Row label="Tipo" value={typeLabel(supplier.type)} />
              {supplier.rfc && <Row label="RFC" value={<span className="font-mono text-xs">{supplier.rfc}</span>} />}
              {supplier.contact && <Row label="Contacto" value={supplier.contact} />}
              {supplier.phone && <Row label="Teléfono" value={supplier.phone} />}
              {supplier.email && <Row label="Correo" value={supplier.email} />}
              {address && <Row label="Dirección" value={address} />}
              {supplier.notes && <Row label="Notas" value={supplier.notes} />}
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
      <span className="shrink-0 text-[var(--color-muted-foreground)]">{label}</span>
      <span className="min-w-0 text-right font-medium">{value}</span>
    </div>
  )
}
