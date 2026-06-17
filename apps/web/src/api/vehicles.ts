import { apiClient } from "@/lib/api-client"

export type VehicleStatus = "pending" | "authorized" | "suspended"

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, { label: string; variant: "success" | "warning" | "destructive" }> = {
  pending: { label: "Pendiente", variant: "warning" },
  authorized: { label: "Autorizada", variant: "success" },
  suspended: { label: "Suspendida", variant: "destructive" },
}

export interface Vehicle {
  id: string
  supplierId: string
  economicNumber: string | null
  plates: string
  year: number | null
  configVehicular: string | null
  grossWeight: string | null
  permSct: string | null
  permSctNumber: string | null
  insurer: string | null
  insurancePolicy: string | null
  status: VehicleStatus
  active: boolean
  notes: string | null
  createdAt: string
}

export type VehicleInput = {
  supplierId: string
  economicNumber?: string | null
  plates: string
  year?: number | null
  configVehicular?: string | null
  grossWeight?: number | null
  permSct?: string | null
  permSctNumber?: string | null
  insurer?: string | null
  insurancePolicy?: string | null
  notes?: string | null
}

export const vehiclesApi = {
  list: (params: { supplierId?: string; status?: string; active?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.supplierId) q.set("supplierId", params.supplierId)
    if (params.status) q.set("status", params.status)
    if (params.active !== undefined) q.set("active", String(params.active))
    const qs = q.toString()
    return apiClient.get<Vehicle[]>(`/vehicles${qs ? `?${qs}` : ""}`)
  },
  create: (data: VehicleInput) => apiClient.post<Vehicle>("/vehicles", data),
  update: (id: string, data: Partial<VehicleInput>) => apiClient.put<Vehicle>(`/vehicles/${id}`, data),
  setStatus: (id: string, status: VehicleStatus) =>
    apiClient.patch<Vehicle>(`/vehicles/${id}/status`, { status }),
  delete: (id: string) => apiClient.delete<void>(`/vehicles/${id}`),
}
