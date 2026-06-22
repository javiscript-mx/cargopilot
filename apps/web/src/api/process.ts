import { apiClient } from "@/lib/api-client"

export type TaskStatus = "pending" | "in_progress" | "done" | "skipped" | "blocked"
export type LegScope = "local" | "foraneo"

export interface ProcessTask {
  id: string
  code: string
  name: string
  order: number
  kind: string // generic | quote | … (panel especializado al abrir la tarea)
  isMilestone: boolean
  optional: boolean
  status: TaskStatus
  assigneeUserId: string | null
  supplierId: string | null
  requiredDocs: string[]
  plannedAt: string | null
  actualAt: string | null
  completedAt: string | null
  notes: string | null
}

export interface ProcessStage {
  id: string
  code: string
  name: string
  order: number
  status: string
  tasks: ProcessTask[]
}

// Unidad de transporte de un tramo (1 motriz + remolques + operador + CFDI CP).
// Un tramo puede tener varias (full repartido en 2 sencillos, etc.).
export interface LegVehicleAssignment {
  id: string
  legId: string
  order: number
  carrierSupplierId: string | null
  vehicleId: string | null
  operatorId: string | null
  trailer1Plate: string | null
  trailer1Type: string | null
  trailer2Plate: string | null
  trailer2Type: string | null
  cartaPorteInvoiceId: string | null
  notes: string | null
  // Nombres resueltos en el API (soft refs)
  carrierName: string | null
  vehicleLabel: string | null
  operatorName: string | null
}

export interface ProcessLeg {
  id: string
  order: number
  scope: LegScope
  status: string
  origin: Record<string, unknown> | null
  destination: Record<string, unknown> | null
  distanceKm: string | null
  plannedPickupAt: string | null
  actualPickupAt: string | null
  plannedDeliveryAt: string | null
  actualDeliveryAt: string | null
  notes: string | null
  tasks: ProcessTask[]
  vehicles: LegVehicleAssignment[]
}

export interface ShipmentProcess {
  workflowTemplateId: string | null
  stages: ProcessStage[]
  legs: ProcessLeg[]
}

export interface CartaPortePreview {
  distanciaKm: number | null
  origen: { rfc: string | null; nombre: string | null; cp: string | null; estado: string | null; domicilio: string | null; fecha: string | null }
  destino: { rfc: string | null; nombre: string | null; cp: string | null; estado: string | null; domicilio: string | null; fecha: string | null }
  autotransporte: { placa: string; config: string | null; anio: number | null; permSct: string | null; numPermiso: string | null; aseguradora: string | null; poliza: string | null } | null
  remolques: string[]
  operador: { rfc: string | null; nombre: string; licencia: string | null } | null
  mercancias: { clave: string | null; descripcion: string; cantidad: number; unidad: string | null; pesoKg: number | null }[]
  pesoTotalKg: number
}

export interface CartaPorteReadiness {
  ready: boolean
  groups: { group: string; items: { label: string; ok: boolean }[] }[]
  defaultTipo: "ingreso" | "traslado"
  invoice: { id: string; series: string; folio: string; status: string; total: string } | null
  preview: CartaPortePreview
}

export interface WorkflowTemplateOption {
  code: string
  name: string
  operationType: string | null
  description: string | null
}

interface TaskPatch {
  status?: TaskStatus
  assigneeUserId?: string | null
  supplierId?: string | null
  plannedAt?: string | null
  actualAt?: string | null
  notes?: string | null
}

// Ubicación de un tramo (origen/destino) — base del nodo Ubicacion de Carta Porte.
// zip/state/lat/lng se derivan de Google Maps (no se capturan a mano).
export interface LegLocation {
  name?: string
  rfc?: string
  zip?: string
  state?: string // c_Estado SAT (Carta Porte)
  address?: string
  lat?: number
  lng?: number
}

export interface LegPatch {
  scope?: LegScope
  status?: ProcessLeg["status"]
  origin?: LegLocation | null
  destination?: LegLocation | null
  distanceKm?: number | null
  plannedPickupAt?: string | null
  actualPickupAt?: string | null
  plannedDeliveryAt?: string | null
  actualDeliveryAt?: string | null
  notes?: string | null
}

export interface LegVehiclePatch {
  carrierSupplierId?: string | null
  vehicleId?: string | null
  operatorId?: string | null
  trailer1Plate?: string | null
  trailer1Type?: string | null
  trailer2Plate?: string | null
  trailer2Type?: string | null
  cartaPorteInvoiceId?: string | null
  notes?: string | null
}

export const processApi = {
  get: (shipmentId: string) => apiClient.get<ShipmentProcess>(`/shipments/${shipmentId}/process`),
  templates: () => apiClient.get<WorkflowTemplateOption[]>("/workflow-templates"),
  applyWorkflow: (shipmentId: string, templateCode: string) =>
    apiClient.post<{ stages: ProcessStage[] }>(`/shipments/${shipmentId}/workflow`, { templateCode }),
  addLeg: (shipmentId: string, scope: LegScope) =>
    apiClient.post<ProcessLeg>(`/shipments/${shipmentId}/legs`, { scope }),
  updateLeg: (legId: string, data: LegPatch) => apiClient.patch<ProcessLeg>(`/legs/${legId}`, data),
  deleteLeg: (legId: string) => apiClient.delete<void>(`/legs/${legId}`),
  addVehicle: (legId: string, data: LegVehiclePatch = {}) =>
    apiClient.post<LegVehicleAssignment>(`/legs/${legId}/vehicles`, data),
  updateVehicle: (vehicleId: string, data: LegVehiclePatch) =>
    apiClient.patch<LegVehicleAssignment>(`/leg-vehicles/${vehicleId}`, data),
  deleteVehicle: (vehicleId: string) => apiClient.delete<void>(`/leg-vehicles/${vehicleId}`),
  cartaPorte: (vehicleId: string) => apiClient.get<CartaPorteReadiness>(`/leg-vehicles/${vehicleId}/carta-porte`),
  stampCartaPorte: (vehicleId: string, data: { tipo?: "ingreso" | "traslado"; freightAmount?: number; freightConcept?: string }) =>
    apiClient.post<{ ok: true; invoiceId: string; facturamaId: string }>(`/leg-vehicles/${vehicleId}/carta-porte/stamp`, data),
  updateTask: (taskId: string, data: TaskPatch) => apiClient.patch<ProcessTask>(`/shipment-tasks/${taskId}`, data),
  updateLegTask: (taskId: string, data: TaskPatch) => apiClient.patch<ProcessTask>(`/leg-tasks/${taskId}`, data),
}
