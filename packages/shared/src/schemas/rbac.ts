import { z } from "zod"
import { ROLES, type Role } from "./common.js"

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de privilegios (single source of truth, compartido API ↔ Web)
//
// Granularidad por recurso + acción. Las lecturas (`*.read`) gobiernan qué ve
// cada rol; las escrituras gobiernan qué puede mutar. El enforcement real vive
// en el API (requirePermission) y el gating de UI en el Web (useCan).
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  // Usuarios y seguridad
  "users.read",
  "users.manage",
  // Clientes
  "customers.read",
  "customers.write",
  // Expedientes / operaciones
  "shipments.read",
  "shipments.write",
  "shipments.changeStatus",
  "shipments.delete",
  "shipments.advanceTask",
  // Facturación (CFDI)
  "invoices.read",
  "invoices.create",
  "invoices.stamp",
  "invoices.cancel",
  // Compras / gastos (módulo de Finanzas)
  "purchases.read",
  "purchases.write",
  "purchases.authorize",
  // Proveedores (incluye unidades y operadores de autotransporte)
  "suppliers.read",
  "suppliers.write",
  "suppliers.delete",
  // Documentos (adjuntos de cualquier entidad)
  "documents.write",
  // Configuración del sistema
  "catalog.manage",
  "settings.manage",
  // Auditoría (bitácora de acciones) — solo admin
  "audit.read",
] as const

export type Permission = (typeof PERMISSIONS)[number]

// Metadatos para la matriz de referencia en la UI
export interface PermissionMeta {
  module: string
  label: string
  description: string
}

export const PERMISSION_META: Record<Permission, PermissionMeta> = {
  "users.read": { module: "Usuarios", label: "Ver usuarios", description: "Consultar la lista de usuarios y sus roles" },
  "users.manage": { module: "Usuarios", label: "Administrar usuarios", description: "Crear, editar rol, activar/desactivar y restablecer contraseñas" },
  "customers.read": { module: "Clientes", label: "Ver clientes", description: "Consultar clientes, su perfil fiscal y actividad" },
  "customers.write": { module: "Clientes", label: "Editar clientes", description: "Crear y modificar clientes, contactos y direcciones" },
  "shipments.read": { module: "Expedientes", label: "Ver expedientes", description: "Consultar expedientes, carga y bitácora" },
  "shipments.write": { module: "Expedientes", label: "Editar expedientes", description: "Crear y modificar expedientes, carga, contenedores y bitácora" },
  "shipments.changeStatus": { module: "Expedientes", label: "Cambiar estado", description: "Avanzar o cancelar el estado de un expediente" },
  "shipments.delete": { module: "Expedientes", label: "Eliminar de expedientes", description: "Eliminar eventos de bitácora y sub-recursos del expediente" },
  "shipments.advanceTask": { module: "Expedientes", label: "Avanzar tareas del proceso", description: "Marcar tareas/hitos del workflow (incluye el timbrado a cargo de Facturación)" },
  "invoices.read": { module: "Facturación", label: "Ver facturas", description: "Consultar facturas y descargar PDF/XML" },
  "invoices.create": { module: "Facturación", label: "Crear borradores", description: "Crear borradores de factura (sin timbrar)" },
  "invoices.stamp": { module: "Facturación", label: "Timbrar CFDI", description: "Timbrar facturas ante el SAT vía Facturama" },
  "invoices.cancel": { module: "Facturación", label: "Cancelar CFDI", description: "Solicitar la cancelación de un CFDI timbrado" },
  "purchases.read": { module: "Compras", label: "Ver compras y gastos", description: "Consultar gastos y cuentas por pagar de los expedientes" },
  "purchases.write": { module: "Compras", label: "Registrar compras y gastos", description: "Registrar y editar gastos/compras de expedientes" },
  "purchases.authorize": { module: "Compras", label: "Autorizar y pagar", description: "Autorizar gastos para pago y marcarlos como pagados" },
  "suppliers.read": { module: "Proveedores", label: "Ver proveedores", description: "Consultar proveedores, unidades y operadores" },
  "suppliers.write": { module: "Proveedores", label: "Editar proveedores", description: "Crear y modificar proveedores, unidades y operadores" },
  "suppliers.delete": { module: "Proveedores", label: "Eliminar proveedores", description: "Dar de baja proveedores del catálogo" },
  "documents.write": { module: "Documentos", label: "Gestionar documentos", description: "Subir y eliminar documentos adjuntos" },
  "catalog.manage": { module: "Configuración", label: "Administrar catálogos", description: "Editar catálogos del sistema (tipos, claves SAT, etc.)" },
  "settings.manage": { module: "Configuración", label: "Administrar configuración", description: "Editar la configuración general y fiscal del sistema" },
  "audit.read": { module: "Auditoría", label: "Ver bitácora de auditoría", description: "Consultar el registro de acciones de los usuarios" },
}

// ─────────────────────────────────────────────────────────────────────────────
// Roles y su matriz de privilegios
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  operator: "Operaciones",
  finance: "Facturación / Finanzas",
  viewer: "Consulta",
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Control total del sistema, incluida la administración de usuarios.",
  operator: "Opera expedientes, clientes y proveedores; crea borradores de factura.",
  finance: "Maneja facturación de extremo a extremo (timbra/cancela CFDI) y datos comerciales del cliente.",
  viewer: "Acceso de solo lectura a la operación.",
}

const READ_ONLY: Permission[] = ["customers.read", "shipments.read", "invoices.read", "suppliers.read", "purchases.read"]

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // El admin tiene todos los privilegios
  admin: PERMISSIONS,
  // Operaciones: ciclo completo de expedientes/clientes/proveedores + borradores de factura
  operator: [
    "customers.read", "customers.write",
    "shipments.read", "shipments.write", "shipments.changeStatus", "shipments.delete", "shipments.advanceTask",
    "invoices.read", "invoices.create",
    "purchases.read", "purchases.write",
    "suppliers.read", "suppliers.write",
    "documents.write",
  ],
  // Facturación/Finanzas: control de facturación de punta a punta + edición comercial del cliente.
  // Puede avanzar tareas del proceso (su tarea de timbrado Carta Porte) sin editar el resto del expediente.
  finance: [
    "customers.read", "customers.write",
    "shipments.read", "shipments.advanceTask",
    "invoices.read", "invoices.create", "invoices.stamp", "invoices.cancel",
    "purchases.read", "purchases.write", "purchases.authorize",
    "suppliers.read",
    "documents.write",
  ],
  // Consulta: solo lectura
  viewer: READ_ONLY,
}

export function permissionsForRole(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role as Role] ?? []
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission)
}

export const PermissionSchema = z.enum(PERMISSIONS)
