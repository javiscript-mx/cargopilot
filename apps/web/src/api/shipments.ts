import { apiClient } from "@/lib/api-client"

export type ShipmentStatus = "draft" | "confirmed" | "in_transit" | "delivered" | "cancelled"

export interface Shipment {
  id: string
  folio: string
  status: ShipmentStatus
  origin: string
  destination: string
  cargo: { description: string; weight?: number; units?: number }
  notes: string | null
  createdAt: string
  customer: { id: string; name: string; rfc: string }
}

export const shipmentsApi = {
  list: () => apiClient.get<Shipment[]>("/shipments"),
  get: (id: string) => apiClient.get<Shipment>(`/shipments/${id}`),
  create: (data: {
    customerId: string
    origin: string
    destination: string
    cargo: Shipment["cargo"]
    notes?: string
  }) => apiClient.post<Shipment>("/shipments", data),
  updateStatus: (id: string, status: ShipmentStatus) =>
    apiClient.patch<Shipment>(`/shipments/${id}/status`, { status }),
}
