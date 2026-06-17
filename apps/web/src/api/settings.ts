import { apiClient } from "@/lib/api-client"

export interface AppSettings {
  "general.businessName": string
  "general.timezone": string
  "maps.countries": string[]
  "invoicing.series": string
  "invoicing.emisorName": string
  "invoicing.emisorRfc": string
  "invoicing.emisorCp": string
  "invoicing.regimenFiscal": string
  "shipments.folioPrefix": string
  "storage.bucket": string
  [key: string]: unknown
}

export const settingsApi = {
  get: () => apiClient.get<AppSettings>("/settings"),
  patch: (data: Partial<AppSettings>) => apiClient.patch<AppSettings>("/settings", data),
}
