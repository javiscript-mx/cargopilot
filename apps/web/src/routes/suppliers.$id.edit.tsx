import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout"
import { SupplierForm } from "@/components/suppliers/supplier-form"
import { suppliersApi } from "@/api/suppliers"
import { ensurePermission } from "@/lib/permissions"

export const Route = createFileRoute("/suppliers/$id/edit")({
  beforeLoad: () => ensurePermission("suppliers.write"),
  component: EditSupplierPage,
})

function EditSupplierPage() {
  const { id } = Route.useParams()
  const { data: supplier, isLoading } = useQuery({
    queryKey: ["suppliers", id],
    queryFn: () => suppliersApi.get(id),
  })

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-[var(--color-muted-foreground)]">
          Cargando...
        </div>
      </AppLayout>
    )
  }

  return <SupplierForm mode="edit" supplier={supplier} />
}
