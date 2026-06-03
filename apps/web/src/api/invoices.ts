import { apiClient } from "@/lib/api-client"

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
  get: (id: string) => apiClient.get<Invoice>(`/invoices/${id}`),
  create: (data: {
    customerId: string
    shipmentId?: string
    items: { description: string; quantity: number; unitPrice: number; productCode: string; unitCode: string }[]
    cfdiUse?: string
    series?: string
  }) => apiClient.post<Invoice>("/invoices", data),
  stamp: (id: string, items: Invoice[]) => apiClient.post<Invoice>(`/invoices/${id}/stamp`, { items }),
  cancel: (id: string, motive?: string) => apiClient.post<Invoice>(`/invoices/${id}/cancel`, { motive }),
  pdfUrl: (id: string) => `/api/invoices/${id}/pdf`,
}
