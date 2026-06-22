import { apiClient } from "@/lib/api-client"
import { VEHICLE_STATUS_LABELS, type VehicleStatus } from "@/api/vehicles"

// Mismo set de estados de autorización que unidades/operadores
export type TrailerStatus = VehicleStatus
export const TRAILER_STATUS_LABELS = VEHICLE_STATUS_LABELS

export interface Trailer {
  id: string
  supplierId: string
  plate: string
  subType: string | null // SubTipoRem (c_SubTipoRem SAT)
  notes: string | null
  status: TrailerStatus
  active: boolean
  createdAt: string
}

export type TrailerInput = {
  supplierId: string
  plate: string
  subType?: string | null
  notes?: string | null
}

export const trailersApi = {
  list: (params: { supplierId?: string; status?: string; active?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.supplierId) q.set("supplierId", params.supplierId)
    if (params.status) q.set("status", params.status)
    if (params.active !== undefined) q.set("active", String(params.active))
    const qs = q.toString()
    return apiClient.get<Trailer[]>(`/trailers${qs ? `?${qs}` : ""}`)
  },
  create: (data: TrailerInput) => apiClient.post<Trailer>("/trailers", data),
  update: (id: string, data: Partial<TrailerInput>) => apiClient.put<Trailer>(`/trailers/${id}`, data),
  setStatus: (id: string, status: TrailerStatus) =>
    apiClient.patch<Trailer>(`/trailers/${id}/status`, { status }),
  delete: (id: string) => apiClient.delete<void>(`/trailers/${id}`),
}
