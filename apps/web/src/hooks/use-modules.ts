import { useSettings } from "@/hooks/use-settings"

// Módulos que se pueden habilitar/deshabilitar globalmente (Configuración → Módulos).
// Hoy es config global; el día que esto sea SaaS, el origen de estas banderas pasa a ser
// el plan del tenant (misma lógica de gating, distinto origen de datos).
export type ModuleKey = "shipments" | "customers" | "invoicing" | "purchases" | "suppliers"

export interface ModuleDef {
  key: ModuleKey
  label: string
  description: string
  paths: string[] // prefijos de ruta que pertenecen al módulo
}

export const MODULES: ModuleDef[] = [
  { key: "shipments", label: "Expedientes", description: "Operación: expedientes, tramos, carga y proceso", paths: ["/shipments"] },
  { key: "customers", label: "Clientes", description: "Catálogo de clientes y su perfil fiscal", paths: ["/customers"] },
  { key: "invoicing", label: "Facturación", description: "Facturación electrónica (CFDI) — dentro de Finanzas", paths: ["/invoices"] },
  { key: "purchases", label: "Compras", description: "Compras y gastos — dentro de Finanzas", paths: ["/purchases"] },
  { key: "suppliers", label: "Proveedores", description: "Proveedores, unidades, operadores y cuentas por pagar", paths: ["/suppliers"] },
]

// Núcleo siempre disponible (no se puede apagar): Dashboard, Usuarios, Catálogos, Configuración.
const CORE_PATHS = ["/", "/users", "/catalog", "/settings"]

export function useModules() {
  const { settings, isLoading } = useSettings()
  // Por defecto habilitado; solo se apaga si el setting es explícitamente "false".
  const isEnabled = (key: ModuleKey) => settings[`modules.${key}`] !== "false"

  // ¿A qué módulo (apagable) pertenece una ruta? null = núcleo / no gateada.
  const moduleForPath = (path: string): ModuleKey | null => {
    if (CORE_PATHS.includes(path)) return null
    const m = MODULES.find((mod) => mod.paths.some((p) => path === p || path.startsWith(`${p}/`)))
    return m?.key ?? null
  }

  return { isEnabled, moduleForPath, isLoading }
}
