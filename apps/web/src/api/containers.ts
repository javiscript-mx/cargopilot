import { apiClient } from "@/lib/api-client"

// Contenedor de un expediente (modalidad contenerizada). Decimals llegan como string.
export interface Container {
  id: string
  shipmentId: string
  number: string
  type: string | null   // catálogo container_type
  seal: string | null
  tare: string | null    // tara en kg
  notes: string | null
  createdAt: string
}

export interface ContainerInput {
  shipmentId: string
  number: string
  type?: string | null
  seal?: string | null
  tare?: number | null
  notes?: string | null
}

export const containersApi = {
  list: (shipmentId: string) => apiClient.get<Container[]>(`/containers?shipmentId=${shipmentId}`),
  create: (data: ContainerInput) => apiClient.post<Container>("/containers", data),
  update: (id: string, data: Partial<Omit<ContainerInput, "shipmentId">>) =>
    apiClient.put<Container>(`/containers/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`/containers/${id}`),
}
