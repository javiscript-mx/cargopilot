import { apiClient } from "@/lib/api-client"
import { pageQuery, type PageParams } from "@/api/customers"

export type InvoiceStatus = "draft" | "stamped" | "cancelled"

export interface Invoice {
  id: string
  series: string
  folio: string
  status: InvoiceStatus
  subtotal: string
  tax: string
  total: string
  cfdiUse: string
  stampedAt: string | null
  createdAt: string
  customer: { id: string; name: string; rfc: string }
}

export const invoicesApi = {
  list: () => apiClient.get<Invoice[]>("/invoices"),
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
  // Los conceptos viven en el borrador; el timbrado los lee de la BD
  stamp: (id: string) => apiClient.post<Invoice>(`/invoices/${id}/stamp`, {}),
  cancel: (id: string, motive: string) => apiClient.post<Invoice>(`/invoices/${id}/cancel`, { motive }),
  pdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
  xmlUrl: (id: string) => `/api/invoices/${id}/xml`,
}
