import { apiClient } from "@/lib/api-client"
import { pageQuery, type PageParams } from "@/api/customers"

export interface Supplier {
  id: string
  name: string
  type: string  // references CatalogItem(category=supplier_type).code
  rfc: string | null
  email: string | null
  phone: string | null
  contact: string | null
  address: Record<string, unknown> | null
  notes: string | null
  creditTermsDays: number | null // días de crédito para vencimiento de cuentas por pagar
  active: boolean
  createdAt: string
  updatedAt: string
}

export type CreateSupplierInput = Omit<Supplier, "id" | "createdAt" | "updatedAt">

export const suppliersApi = {
  list: () => apiClient.get<Supplier[]>("/suppliers"),
  listPaged: (params: PageParams) => apiClient.getPaged<Supplier>(`/suppliers?${pageQuery(params)}`),
  get: (id: string) => apiClient.get<Supplier>(`/suppliers/${id}`),
  create: (data: CreateSupplierInput) => apiClient.post<Supplier>("/suppliers", data),
  update: (id: string, data: Partial<CreateSupplierInput>) =>
    apiClient.put<Supplier>(`/suppliers/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`/suppliers/${id}`),
}
