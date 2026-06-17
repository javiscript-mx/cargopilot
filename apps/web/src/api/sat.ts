import { apiClient } from "@/lib/api-client"

export interface SatProductKey { code: string; description: string; dangerous: boolean }
export interface SatUnitKey { code: string; name: string; symbol: string | null }

// Catálogos SAT grandes — siempre por búsqueda (nunca cargar todo).
export const satApi = {
  searchProdserv: (q: string) => apiClient.get<SatProductKey[]>(`/sat/prodserv?q=${encodeURIComponent(q)}`),
  getProdserv: (code: string) => apiClient.get<SatProductKey[]>(`/sat/prodserv?code=${encodeURIComponent(code)}`),
  searchUnidades: (q: string) => apiClient.get<SatUnitKey[]>(`/sat/unidades?q=${encodeURIComponent(q)}`),
  getUnidad: (code: string) => apiClient.get<SatUnitKey[]>(`/sat/unidades?code=${encodeURIComponent(code)}`),
}
