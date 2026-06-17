import { apiClient } from "@/lib/api-client"

export interface Customer {
  id: string
  name: string
  rfc: string
  email: string | null
  phone: string | null
  address: Record<string, unknown> | null
  fiscalRegime: string | null
  fiscalZipCode: string | null
  createdAt: string
}

export interface PageParams { page: number; pageSize: number; search?: string }
export function pageQuery({ page, pageSize, search }: PageParams): string {
  const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search?.trim()) p.set("search", search.trim())
  return p.toString()
}

export const customersApi = {
  list: () => apiClient.get<Customer[]>("/customers"),
  listPaged: (params: PageParams) => apiClient.getPaged<Customer>(`/customers?${pageQuery(params)}`),
  get: (id: string) => apiClient.get<Customer>(`/customers/${id}`),
  create: (data: Omit<Customer, "id" | "createdAt">) => apiClient.post<Customer>("/customers", data),
  update: (id: string, data: Partial<Customer>) => apiClient.put<Customer>(`/customers/${id}`, data),
}
