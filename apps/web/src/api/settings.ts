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
  "appearance.primaryColor": string
  "appearance.accentColor": string
  "appearance.menuColor": string
  "branding.systemName": string
  "branding.logoDataUrl": string
  "company.phone": string
  "company.email": string
  "company.website": string
  "company.address": string
  [key: string]: unknown // incluye modules.<key> = "true" | "false"
}

export const settingsApi = {
  get: () => apiClient.get<AppSettings>("/settings"),
  patch: (data: Partial<AppSettings>) => apiClient.patch<AppSettings>("/settings", data),
}
