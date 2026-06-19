import { apiClient } from "@/lib/api-client"
import { pageQuery, type PageParams } from "@/api/customers"

export type ShipmentStatus = "draft" | "confirmed" | "in_transit" | "delivered" | "cancelled"

// Etiquetas genéricas: un expediente puede ser un flete o un servicio (lavado, almacenaje...)
export const STATUS_CONFIG: Record<ShipmentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  in_transit: { label: "En proceso", variant: "warning" },
  delivered: { label: "Completado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "destructive" },
}

export interface ShipmentEvent {
  id: string
  type: "status_change" | "milestone" | "note"
  source: "manual" | "system"
  title: string
  detail: string | null
  occurredAt: string
  createdBy: string | null
  createdAt: string
}

export interface Shipment {
  id: string
  folio: string
  status: ShipmentStatus
  operationType: string // catálogo service_type
  transportMode: string | null // catálogo transport_mode
  cargoType: string | null // catálogo cargo_type (modalidad)
  origin: string | null
  destination: string | null
  cargo: { description: string } | null
  reference: string | null
  notes: string | null
  customerId: string
  createdAt: string
  customer: { id: string; name: string; rfc: string }
  events?: ShipmentEvent[]
  invoices?: { id: string; series: string; folio: string; status: string }[]
  // Autotransporte (Carta Porte)
  vehicleId: string | null
  operatorId: string | null
  vehicle?: {
    id: string; plates: string; economicNumber: string | null
    supplier: { id: string; name: string }
  } | null
  operator?: {
    id: string; name: string; licenseNumber: string | null
    supplier: { id: string; name: string }
  } | null
}

export interface ShipmentInput {
  customerId: string
  operationType: string
  transportMode?: string | null
  cargoType?: string | null
  origin?: string | null
  destination?: string | null
  reference?: string | null
  cargo?: { description: string; weight?: number; units?: number } | null
  notes?: string | null
  vehicleId?: string | null
  operatorId?: string | null
}

export const shipmentsApi = {
  list: () => apiClient.get<Shipment[]>("/shipments"),
  listPaged: (params: PageParams) => apiClient.getPaged<Shipment>(`/shipments?${pageQuery(params)}`),
  get: (id: string) => apiClient.get<Shipment>(`/shipments/${id}`),
  create: (data: ShipmentInput) => apiClient.post<Shipment>("/shipments", data),
  update: (id: string, data: Partial<ShipmentInput>) =>
    apiClient.put<Shipment>(`/shipments/${id}`, data),
  updateStatus: (id: string, status: ShipmentStatus) =>
    apiClient.patch<Shipment>(`/shipments/${id}/status`, { status }),
  addEvent: (id: string, data: { type: "milestone" | "note"; title: string; detail?: string; occurredAt?: string }) =>
    apiClient.post<ShipmentEvent>(`/shipments/${id}/events`, data),
  deleteEvent: (id: string, eventId: string) =>
    apiClient.delete<void>(`/shipments/${id}/events/${eventId}`),
}
