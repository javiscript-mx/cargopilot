import { apiClient } from "@/lib/api-client"

export type TaskStatus = "pending" | "in_progress" | "done" | "skipped" | "blocked"
export type LegScope = "local" | "foraneo"

export interface ProcessTask {
  id: string
  code: string
  name: string
  order: number
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

export interface ProcessLeg {
  id: string
  order: number
  scope: LegScope
  status: string
  origin: Record<string, unknown> | null
  destination: Record<string, unknown> | null
  distanceKm: string | null
  carrierSupplierId: string | null
  vehicleId: string | null
  operatorId: string | null
  plannedPickupAt: string | null
  actualPickupAt: string | null
  plannedDeliveryAt: string | null
  actualDeliveryAt: string | null
  cartaPorteInvoiceId: string | null
  notes: string | null
  tasks: ProcessTask[]
  // Nombres resueltos en el API (soft refs) para mostrar sin queries extra
  carrierName: string | null
  vehicleLabel: string | null
  operatorName: string | null
}

export interface ShipmentProcess {
  workflowTemplateId: string | null
  stages: ProcessStage[]
  legs: ProcessLeg[]
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

// Ubicación de un tramo (origen/destino) — base del nodo Ubicacion de Carta Porte
export interface LegLocation {
  name?: string
  rfc?: string
  zip?: string
  address?: string
}

export interface LegPatch {
  status?: ProcessLeg["status"]
  origin?: LegLocation | null
  destination?: LegLocation | null
  distanceKm?: number | null
  carrierSupplierId?: string | null
  vehicleId?: string | null
  operatorId?: string | null
  plannedPickupAt?: string | null
  actualPickupAt?: string | null
  plannedDeliveryAt?: string | null
  actualDeliveryAt?: string | null
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
  updateTask: (taskId: string, data: TaskPatch) => apiClient.patch<ProcessTask>(`/shipment-tasks/${taskId}`, data),
  updateLegTask: (taskId: string, data: TaskPatch) => apiClient.patch<ProcessTask>(`/leg-tasks/${taskId}`, data),
}
