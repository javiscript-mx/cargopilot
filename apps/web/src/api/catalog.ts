import { apiClient } from "@/lib/api-client"

export const CATALOG_CATEGORY_LABELS: Record<string, string> = {
  supplier_type:       "Tipo de proveedor",
  service_type:        "Tipo de servicio",
  transport_mode:      "Modo de transporte",
  cargo_type:          "Tipo de carga",
  container_type:      "Tipo de contenedor",
  incoterm:            "Incoterm",
  port:                "Puerto / Aeropuerto",
  milestone:           "Hitos de trazabilidad",
  sat_product_key:     "Clave producto SAT",
  sat_unit_key:        "Clave unidad SAT",
  sat_cfdi_use:        "Uso CFDI",
  sat_payment_form:    "Forma de pago",
  sat_payment_method:  "Método de pago",
  cp_config_vehicular: "Config. vehicular (Carta Porte)",
  cp_perm_sct:         "Permiso SCT (Carta Porte)",
}

// Groups for display in the catalog admin page
export const CATALOG_GROUPS = [
  {
    label: "Operación",
    categories: ["supplier_type", "service_type", "transport_mode", "cargo_type", "container_type", "incoterm", "port", "milestone"],
  },
  {
    label: "SAT / Facturación",
    categories: ["sat_product_key", "sat_unit_key", "sat_cfdi_use", "sat_payment_form", "sat_payment_method"],
  },
  {
    label: "Carta Porte",
    categories: ["cp_config_vehicular", "cp_perm_sct"],
  },
]

export type CatalogCategory = keyof typeof CATALOG_CATEGORY_LABELS

export interface CatalogItem {
  id: string
  category: CatalogCategory
  code: string
  name: string
  extra: Record<string, unknown> | null
  active: boolean
  createdAt: string
}

export const catalogApi = {
  listItems: (category?: string, onlyActive = true) =>
    apiClient.get<CatalogItem[]>(
      `/catalog/items?${category ? `category=${category}&` : ""}${onlyActive ? "active=true" : ""}`,
    ),
  createItem: (data: Omit<CatalogItem, "id" | "createdAt">) =>
    apiClient.post<CatalogItem>("/catalog/items", data),
  // Editar = baja lógica + alta nueva (el API devuelve el registro nuevo)
  updateItem: (id: string, data: Partial<Omit<CatalogItem, "id" | "createdAt">>) =>
    apiClient.put<CatalogItem>(`/catalog/items/${id}`, data),
  // Activar / desactivar (baja lógica)
  setActive: (id: string, active: boolean) =>
    apiClient.patch<CatalogItem>(`/catalog/items/${id}/active`, { active }),
  // "Eliminar" = baja lógica
  deleteItem: (id: string) => apiClient.delete<void>(`/catalog/items/${id}`),
}
