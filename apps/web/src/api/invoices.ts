import { apiClient } from "@/lib/api-client"
import { pageQuery, type PageParams } from "@/api/customers"

export type InvoiceStatus = "draft" | "stamped" | "cancelled"

export interface InvoiceItem {
  description: string
  quantity: number
  unitPrice: number
  productCode: string
  unitCode: string
}

export interface Invoice {
  id: string
  series: string
  folio: string
  status: InvoiceStatus
  kind?: string
  subtotal: string
  tax: string
  retention?: string
  total: string
  cfdiUse: string
  paymentForm?: string
  paymentMethod?: string
  items?: InvoiceItem[] | null
  shipmentId?: string | null
  facturamaid?: string | null
  uuid?: string | null // Folio fiscal (UUID) del CFDI timbrado
  satSerie?: string | null // Serie real estampada por el PAC
  satFolio?: string | null // Folio real estampado por el PAC
  stampedAt: string | null
  createdAt: string
  customer: { id: string; name: string; rfc: string }
}

export const invoicesApi = {
  list: () => apiClient.get<Invoice[]>("/invoices"),
  listByShipment: (shipmentId: string) => apiClient.get<Invoice[]>(`/invoices?shipmentId=${shipmentId}`),
  listPaged: (params: PageParams) => apiClient.getPaged<Invoice>(`/invoices?${pageQuery(params)}`),
  get: (id: string) => apiClient.get<Invoice>(`/invoices/${id}`),
  create: (data: {
    customerId: string
    shipmentId?: string
    items: { description: string; quantity: number; unitPrice: number; productCode: string; unitCode: string }[]
    cfdiUse?: string
    paymentForm?: string
    paymentMethod?: string
    series?: string
  }) => apiClient.post<Invoice>("/invoices", data),
  // Los conceptos viven en el borrador; el timbrado los lee de la BD.
  // `cartaPorte` adjunta el complemento del transporte de una unidad (tramo) a esta factura.
  stamp: (id: string, opts?: { cartaPorte?: { legVehicleId: string } }) =>
    apiClient.post<Invoice>(`/invoices/${id}/stamp`, opts ?? {}),
  cancel: (id: string, motive: string) => apiClient.post<Invoice>(`/invoices/${id}/cancel`, { motive }),
  delete: (id: string) => apiClient.delete<void>(`/invoices/${id}`),
  pdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
  xmlUrl: (id: string) => `/api/invoices/${id}/xml`,
}
