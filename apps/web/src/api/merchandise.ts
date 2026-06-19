import { apiClient } from "@/lib/api-client"

// Partida de mercancía de un expediente (alimenta el nodo Mercancias de Carta Porte).
// Los Decimal del API llegan como string.
export interface Merchandise {
  id: string
  shipmentId: string
  description: string
  quantity: string
  unitKey: string | null   // catálogo sat_unit_key
  weight: string | null    // PesoEnKg
  value: string | null     // ValorMercancia
  productKey: string | null // catálogo sat_product_key
  hsCode: string | null    // FraccionArancelaria
  containerId: string | null // contenedor asignado (opcional)
  legId: string | null       // tramo asignado (Carta Porte por tramo)
  notes: string | null
  createdAt: string
}

export interface MerchandiseInput {
  shipmentId: string
  description: string
  quantity: number
  unitKey?: string | null
  weight?: number | null
  value?: number | null
  productKey?: string | null
  hsCode?: string | null
  containerId?: string | null
  legId?: string | null
  notes?: string | null
}

export const merchandiseApi = {
  list: (shipmentId: string) =>
    apiClient.get<Merchandise[]>(`/merchandise?shipmentId=${shipmentId}`),
  create: (data: MerchandiseInput) => apiClient.post<Merchandise>("/merchandise", data),
  update: (id: string, data: Partial<Omit<MerchandiseInput, "shipmentId">>) =>
    apiClient.put<Merchandise>(`/merchandise/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`/merchandise/${id}`),
}
