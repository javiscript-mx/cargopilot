import { createFileRoute } from "@tanstack/react-router"
import { SupplierForm } from "@/components/suppliers/supplier-form"

export const Route = createFileRoute("/suppliers/new")({
  component: () => <SupplierForm mode="create" />,
})
