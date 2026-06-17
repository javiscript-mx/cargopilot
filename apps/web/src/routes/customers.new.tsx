import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { customersApi, type CustomerPayload } from "@/api/customers"
import { documentsApi } from "@/api/documents"
import { PendingFilesPicker } from "@/components/ui/documents-section"
import { CustomerMasterForm } from "@/components/customers/customer-master-form"
import { useToast } from "@/components/ui/toast"

export const Route = createFileRoute("/customers/new")({
  component: NewCustomerPage,
})

function NewCustomerPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  const mutation = useMutation({
    mutationFn: customersApi.create,
    onSuccess: async (customer) => {
      const failed: string[] = []
      for (const file of pendingFiles) {
        try {
          await documentsApi.upload("customer", customer.id, file)
        } catch {
          failed.push(file.name)
        }
      }
      queryClient.invalidateQueries({ queryKey: ["customers"] })
      if (failed.length) {
        toast.error("Cliente creado, pero fallaron archivos", `${failed.join(", ")}. Reintenta desde Editar.`)
      } else {
        toast.success("Cliente creado", customer.name)
      }
      navigate({ to: "/customers" })
    },
    onError: (err: Error) => toast.error("No se pudo crear el cliente", err.message),
  })

  function handleSubmit(payload: CustomerPayload) {
    mutation.mutate(payload)
  }

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/customers" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Clientes
        </Link>
        <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      </div>

      <CustomerMasterForm submitLabel="Guardar cliente" loading={mutation.isPending} onSubmit={handleSubmit}>
        <PendingFilesPicker files={pendingFiles} onChange={setPendingFiles} disabled={mutation.isPending} />
      </CustomerMasterForm>
    </AppLayout>
  )
}
