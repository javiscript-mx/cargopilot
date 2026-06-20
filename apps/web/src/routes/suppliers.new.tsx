import { createFileRoute } from "@tanstack/react-router"
import { SupplierForm } from "@/components/suppliers/supplier-form"
import { ensurePermission } from "@/lib/permissions"

export const Route = createFileRoute("/suppliers/new")({
  beforeLoad: () => ensurePermission("suppliers.write"),
  component: () => <SupplierForm mode="create" />,
})
