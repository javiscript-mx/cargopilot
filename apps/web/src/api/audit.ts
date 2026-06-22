import { apiClient } from "@/lib/api-client"
import type { PageParams } from "@/api/customers"

export type AuditAction = "create" | "update" | "delete"

export interface AuditLog {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  userRole: string | null
  action: AuditAction
  method: string
  path: string
  route: string | null
  entityType: string | null
  entityId: string | null
  statusCode: number
  ip: string | null
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface AuditFilters extends PageParams {
  entityType?: string
  action?: AuditAction | ""
  from?: string
  to?: string
}

function auditQuery(f: AuditFilters): string {
  const p = new URLSearchParams({ page: String(f.page), pageSize: String(f.pageSize) })
  if (f.search?.trim()) p.set("search", f.search.trim())
  if (f.entityType) p.set("entityType", f.entityType)
  if (f.action) p.set("action", f.action)
  if (f.from) p.set("from", f.from)
  if (f.to) p.set("to", f.to)
  return p.toString()
}

export const ACTION_LABELS: Record<AuditAction, { label: string; variant: "success" | "warning" | "destructive" }> = {
  create: { label: "Creó", variant: "success" },
  update: { label: "Actualizó", variant: "warning" },
  delete: { label: "Eliminó", variant: "destructive" },
}

// Nombres legibles para los recursos del path (entityType)
export const ENTITY_LABELS: Record<string, string> = {
  shipments: "Expediente", customers: "Cliente", invoices: "Factura", suppliers: "Proveedor",
  expenses: "Gasto", merchandise: "Mercancía", containers: "Contenedor", documents: "Documento",
  users: "Usuario", catalog: "Catálogo", settings: "Configuración", legs: "Tramo",
  "leg-vehicles": "Unidad de tramo", "shipment-tasks": "Tarea", "leg-tasks": "Tarea de tramo",
  vehicles: "Unidad", operators: "Operador", trailers: "Remolque", quote: "Cotización",
}

export const auditApi = {
  listPaged: (f: AuditFilters) => apiClient.getPaged<AuditLog>(`/audit?${auditQuery(f)}`),
}
