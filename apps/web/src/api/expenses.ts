import { apiClient } from "@/lib/api-client"

export type ExpenseStatus = "pending" | "authorized" | "partial" | "paid"

export const EXPENSE_STATUS: Record<ExpenseStatus, { label: string; variant: "warning" | "default" | "success" }> = {
  pending: { label: "Por pagar", variant: "warning" },
  authorized: { label: "Autorizado", variant: "default" },
  partial: { label: "Pago parcial", variant: "default" },
  paid: { label: "Pagado", variant: "success" },
}

export type PaymentMethod = "transferencia" | "cheque" | "efectivo" | "tarjeta" | "otro"
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "otro", label: "Otro" },
]

export interface ExpensePayment {
  id: string
  amount: string
  method: PaymentMethod
  reference: string | null
  paidAt: string
  notes: string | null
  createdAt: string
}

export interface PaymentInput { amount: number; method: PaymentMethod; reference?: string | null; paidAt?: string | null }

export interface ShipmentExpense {
  id: string
  shipmentId: string
  category: string
  supplierId: string | null
  concept: string
  amount: string // Decimal → string
  currency: string
  status: ExpenseStatus
  expenseDate: string | null
  reference: string | null
  notes: string | null
  authorizedAt?: string | null
  paidAt?: string | null
  paidAmount?: string // suma de pagos
  dueDate?: string | null // vencimiento (fecha base + días de crédito del proveedor)
  creditTermsDays?: number | null
  payments?: ExpensePayment[]
  hasEvidence?: boolean // folio de factura o documento adjunto
  createdAt: string
}

export interface ExpenseInput {
  category: string
  concept: string
  amount: number
  currency?: string
  // status NO se envía: lo deriva el backend del flujo de autorización/pagos.
  supplierId?: string | null
  shipmentId?: string | null // solo en el alta global desde Compras (opcional = gasto general)
  expenseDate?: string | null
  reference?: string | null
  notes?: string | null
}

// Detalle de un gasto (con resumen del expediente ligado, si lo hay)
export interface ExpenseDetail extends ShipmentExpense {
  supplierName?: string | null
  shipment?: {
    id: string; folio: string; status: string
    origin: string | null; destination: string | null; cargoType: string | null
    customer: { name: string } | null
  } | null
}

// Gasto con el expediente/proveedor (vista global de Compras y cuentas por pagar)
export interface ExpenseWithShipment extends ShipmentExpense {
  shipment?: { id: string; folio: string } | null
  supplierName?: string | null
}

export interface ExpenseFilters { supplierId?: string; status?: ExpenseStatus; category?: string; from?: string; to?: string }

function toQuery(f: ExpenseFilters = {}): string {
  const p = new URLSearchParams()
  if (f.supplierId) p.set("supplierId", f.supplierId)
  if (f.status) p.set("status", f.status)
  if (f.category) p.set("category", f.category)
  if (f.from) p.set("from", f.from)
  if (f.to) p.set("to", f.to)
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const expensesApi = {
  list: (shipmentId: string) => apiClient.get<ShipmentExpense[]>(`/shipments/${shipmentId}/expenses`),
  all: (filters?: ExpenseFilters) => apiClient.get<ExpenseWithShipment[]>(`/expenses${toQuery(filters)}`),
  bySupplier: (supplierId: string) => apiClient.get<ExpenseWithShipment[]>(`/expenses?supplierId=${supplierId}`),
  get: (id: string) => apiClient.get<ExpenseDetail>(`/expenses/${id}`),
  create: (shipmentId: string, data: ExpenseInput) => apiClient.post<ShipmentExpense>(`/shipments/${shipmentId}/expenses`, data),
  createGlobal: (data: ExpenseInput) => apiClient.post<ShipmentExpense>(`/expenses`, data),
  update: (id: string, data: Partial<ExpenseInput>) => apiClient.put<ShipmentExpense>(`/expenses/${id}`, data),
  delete: (id: string) => apiClient.delete<void>(`/expenses/${id}`),
  authorize: (id: string) => apiClient.post<ShipmentExpense>(`/expenses/${id}/authorize`, {}),
  registerPayment: (id: string, data: PaymentInput) => apiClient.post<ShipmentExpense>(`/expenses/${id}/payments`, data),
  deletePayment: (id: string, paymentId: string) => apiClient.delete<ShipmentExpense>(`/expenses/${id}/payments/${paymentId}`),
  revert: (id: string) => apiClient.post<ShipmentExpense>(`/expenses/${id}/revert`, {}),
}
