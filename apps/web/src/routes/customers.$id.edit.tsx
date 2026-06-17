import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { customersApi, type CustomerPayload } from "@/api/customers"
import { DocumentsSection } from "@/components/ui/documents-section"
import { CustomerMasterForm } from "@/components/customers/customer-master-form"
import { useToast } from "@/components/ui/toast"

export const Route = createFileRoute("/customers/$id/edit")({
  component: EditCustomerPage,
})

function EditCustomerPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customers", id],
    queryFn: () => customersApi.get(id),
  })

  const mutation = useMutation({
    mutationFn: (data: CustomerPayload) => customersApi.update(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] })
      queryClient.invalidateQueries({ queryKey: ["customers", id] })
      toast.success("Cambios guardados", updated.name)
      navigate({ to: "/customers" })
    },
    onError: (err: Error) => toast.error("No se pudieron guardar los cambios", err.message),
  })

  if (isLoading || !customer) {
    return (
      <AppLayout>
        <div className="flex h-40 items-center justify-center text-[--color-muted-foreground]">
          Cargando...
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/customers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <h1 className="text-2xl font-bold">Editar cliente</h1>
      </div>

      <CustomerMasterForm
        customer={customer}
        submitLabel="Guardar cambios"
        loading={mutation.isPending}
        onSubmit={(payload) => mutation.mutate(payload)}
      >
        <DocumentsSection entityType="customer" entityId={id} />
      </CustomerMasterForm>
    </AppLayout>
  )
}
