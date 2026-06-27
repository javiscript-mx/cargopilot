import { apiClient } from "@/lib/api-client"

// Cotización / tarifa del expediente (paso "cotizar", kind=quote).
export type QuoteStatus = "draft" | "sent" | "accepted" | "rejected"

export interface QuoteItem {
  concept: string
  amount: number // venta al cliente (sin IVA)
  productKey?: string // clave prodserv SAT (liga cotizado ↔ facturado)
  estimatedCost?: number // costo estimado de ESTE servicio (sin IVA) — margen por concepto
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

export interface QuoteRevision {
  id: string
  shipmentId: string
  version: number
  status: QuoteStatus
  currency: string
  items: QuoteItem[] | null
  subtotal: string // Decimal → string
  estimatedCost: string | null
  notes: string | null
  createdAt: string
  createdBy: string | null
}

export const quotesApi = {
  // Devuelve null si el expediente aún no tiene cotización
  get: (shipmentId: string) => apiClient.get<ShipmentQuote | null>(`/shipments/${shipmentId}/quote`),
  save: (shipmentId: string, data: QuoteInput) =>
    apiClient.put<ShipmentQuote>(`/shipments/${shipmentId}/quote`, data),
  revisions: (shipmentId: string) => apiClient.get<QuoteRevision[]>(`/shipments/${shipmentId}/quote/revisions`),
  // URL del PDF comercial de la cotización (se abre en pestaña nueva; usa la cookie de sesión)
  pdfUrl: (shipmentId: string) => `/api/shipments/${shipmentId}/quote/pdf`,
}
