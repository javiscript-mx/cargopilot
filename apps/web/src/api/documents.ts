import { apiClient } from "@/lib/api-client"

export type DocumentEntityType = "customer" | "supplier" | "shipment" | "invoice" | "expense"

export interface AppDocument {
  id: string
  entityType: DocumentEntityType
  entityId: string
  kind: string | null
  notes: string | null
  originalName: string
  mimeType: string
  size: number
  createdAt: string
}

export interface UploadMeta { kind?: string | null; notes?: string | null }

export interface StorageStatus {
  configured: boolean
  mode: "gcs" | "local"
  bucket: string | null
}

export const documentsApi = {
  status: () => apiClient.get<StorageStatus>("/documents/status"),

  list: (entityType: DocumentEntityType, entityId: string) =>
    apiClient.get<AppDocument[]>(`/documents?entityType=${entityType}&entityId=${entityId}`),

  // multipart — no usa el wrapper JSON
  upload: async (entityType: DocumentEntityType, entityId: string, file: File, meta?: UploadMeta): Promise<AppDocument> => {
    const formData = new FormData()
    formData.append("entityType", entityType)
    formData.append("entityId", entityId)
    if (meta?.kind) formData.append("kind", meta.kind)
    if (meta?.notes) formData.append("notes", meta.notes)
    formData.append("file", file)
    const response = await fetch("/api/documents/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Error al subir archivo" }))
      throw new Error(typeof body.error === "string" ? body.error : "Error al subir archivo")
    }
    return response.json()
  },

  downloadUrl: (id: string) => apiClient.get<{ url: string }>(`/documents/${id}/download`),

  delete: (id: string) => apiClient.delete<void>(`/documents/${id}`),
}
