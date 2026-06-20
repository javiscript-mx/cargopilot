import { apiClient } from "@/lib/api-client"

// Cotización / tarifa del expediente (paso "cotizar", kind=quote).
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected"

export interface QuoteItem {
  concept: string
  amount: number
  productKey?: string // clave prodserv SAT (liga cotizado ↔ facturado)
}

export interface ShipmentQuote {
  id: string
  shipmentId: string
  status: QuoteStatus
  currency: string
  validUntil: string | null
  items: QuoteItem[] | null
  estimatedCost: string | null // Decimal → string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface QuoteInput {
  status?: QuoteStatus
  currency?: string
  validUntil?: string | null
  items?: QuoteItem[]
  estimatedCost?: number | null
  notes?: string | null
}

export const quotesApi = {
  // Devuelve null si el expediente aún no tiene cotización
  get: (shipmentId: string) => apiClient.get<ShipmentQuote | null>(`/shipments/${shipmentId}/quote`),
  save: (shipmentId: string, data: QuoteInput) =>
    apiClient.put<ShipmentQuote>(`/shipments/${shipmentId}/quote`, data),
}
