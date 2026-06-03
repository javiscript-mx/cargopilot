import { apiClient } from "@/lib/api-client"

export interface Customer {
  id: string
  name: string
  rfc: string
  email: string | null
  phone: string | null
  createdAt: string
}

export const customersApi = {
  list: () => apiClient.get<Customer[]>("/customers"),
  get: (id: string) => apiClient.get<Customer>(`/customers/${id}`),
  create: (data: Omit<Customer, "id" | "createdAt">) => apiClient.post<Customer>("/customers", data),
  update: (id: string, data: Partial<Customer>) => apiClient.put<Customer>(`/customers/${id}`, data),
}
