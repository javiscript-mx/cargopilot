import { apiClient } from "@/lib/api-client"

export interface SatProductKey { code: string; description: string; dangerous: boolean }
export interface SatUnitKey { code: string; name: string; symbol: string | null }

// Catálogos SAT grandes — siempre por búsqueda (nunca cargar todo).
export const satApi = {
  // `goods` restringe a bienes tangibles (excluye servicios) — para mercancía de Carta Porte.
  searchProdserv: (q: string, opts?: { goods?: boolean }) =>
    apiClient.get<SatProductKey[]>(`/sat/prodserv?q=${encodeURIComponent(q)}${opts?.goods ? "&goods=1" : ""}`),
  getProdserv: (code: string) => apiClient.get<SatProductKey[]>(`/sat/prodserv?code=${encodeURIComponent(code)}`),
  searchUnidades: (q: string) => apiClient.get<SatUnitKey[]>(`/sat/unidades?q=${encodeURIComponent(q)}`),
  getUnidad: (code: string) => apiClient.get<SatUnitKey[]>(`/sat/unidades?code=${encodeURIComponent(code)}`),
}
