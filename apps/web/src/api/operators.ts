import { apiClient } from "@/lib/api-client"
import { VEHICLE_STATUS_LABELS, type VehicleStatus } from "@/api/vehicles"

// Mismo set de estados de autorización que las unidades
export type OperatorStatus = VehicleStatus
export const OPERATOR_STATUS_LABELS = VEHICLE_STATUS_LABELS

export interface Operator {
  id: string
  supplierId: string
  name: string
  rfc: string | null
  licenseNumber: string | null
  address: Record<string, unknown> | null
  status: OperatorStatus
  active: boolean
  createdAt: string
}

export type OperatorInput = {
  supplierId: string
  name: string
  rfc?: string | null
  licenseNumber?: string | null
  address?: Record<string, unknown> | null
}

export const operatorsApi = {
  list: (params: { supplierId?: string; status?: string; active?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.supplierId) q.set("supplierId", params.supplierId)
    if (params.status) q.set("status", params.status)
    if (params.active !== undefined) q.set("active", String(params.active))
    const qs = q.toString()
    return apiClient.get<Operator[]>(`/operators${qs ? `?${qs}` : ""}`)
  },
  create: (data: OperatorInput) => apiClient.post<Operator>("/operators", data),
  update: (id: string, data: Partial<OperatorInput>) => apiClient.put<Operator>(`/operators/${id}`, data),
  setStatus: (id: string, status: OperatorStatus) =>
    apiClient.patch<Operator>(`/operators/${id}/status`, { status }),
  delete: (id: string) => apiClient.delete<void>(`/operators/${id}`),
}
