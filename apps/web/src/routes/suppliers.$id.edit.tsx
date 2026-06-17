import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout"
import { SupplierForm } from "@/components/suppliers/supplier-form"
import { suppliersApi } from "@/api/suppliers"

export const Route = createFileRoute("/suppliers/$id/edit")({
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
        <div className="flex h-40 items-center justify-center text-[--color-muted-foreground]">
          Cargando...
        </div>
      </AppLayout>
    )
  }

  return <SupplierForm mode="edit" supplier={supplier} />
}
