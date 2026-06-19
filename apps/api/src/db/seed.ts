import { Prisma } from "@prisma/client"
import { prisma } from "./client.js"
import { auth } from "../lib/auth.js"
import { SAT_CATALOG_SEEDS } from "./sat-catalogs.seed.js"
import { seedWorkflowTemplates } from "./workflow.seed.js"

// ─── Catálogos default ───────────────────────────────────────────────────────

const CATALOG_SEEDS: { category: string; code: string; name: string; extra?: Prisma.InputJsonValue }[] = [
  // Tipos de proveedor
  // `autotransporte: true` → el detalle del proveedor muestra Unidades/Operadores (Carta Porte)
  { category: "supplier_type", code: "carrier",       name: "Transportista terrestre", extra: { autotransporte: true } },
  { category: "supplier_type", code: "airline",       name: "Aerolínea" },
  { category: "supplier_type", code: "shipping_line", name: "Naviera" },
  { category: "supplier_type", code: "customs",       name: "Agente aduanal" },
  { category: "supplier_type", code: "warehouse",     name: "Almacén / Bodega" },
  { category: "supplier_type", code: "other",         name: "Otro" },

  // Tipos de operación/servicio. Por ahora SOLO flete terrestre está activo
  // (decisión 2026-06-18). `extra.defaultTransport` prellena el modo de transporte
  // en el alta del expediente. Los demás se reactivan desde Catálogos cuando se
  // operen (o se descomentan aquí).
  { category: "service_type", code: "DOMESTIC", name: "Flete terrestre", extra: { defaultTransport: "LAND" } },
  // { category: "service_type", code: "IMPORT",         name: "Importación" },
  // { category: "service_type", code: "EXPORT",         name: "Exportación" },
  // { category: "service_type", code: "TRANSIT",        name: "Tránsito internacional" },
  // { category: "service_type", code: "CUSTOMS",        name: "Despacho aduanal" },
  // { category: "service_type", code: "STORAGE",        name: "Almacenaje" },
  // { category: "service_type", code: "CONTAINER_WASH", name: "Lavado de contenedor" },
  // { category: "service_type", code: "HANDLING",       name: "Maniobras" },
  // { category: "service_type", code: "FUMIGATION",     name: "Fumigación" },
  // { category: "service_type", code: "CUSTODY",        name: "Custodia" },
  // { category: "service_type", code: "INSURANCE",      name: "Seguro de carga" },
  // { category: "service_type", code: "OTHER",          name: "Otro servicio" },

  // Hitos de trazabilidad — eventos típicos en la bitácora de un expediente
  { category: "milestone", code: "BOOKING",         name: "Booking confirmado" },
  { category: "milestone", code: "PICKUP",          name: "Carga recolectada" },
  { category: "milestone", code: "PORT_ARRIVAL",    name: "Arribo a puerto/aeropuerto" },
  { category: "milestone", code: "VESSEL_DEPARTED", name: "Embarque zarpó / vuelo salió" },
  { category: "milestone", code: "PORT_DISCHARGE",  name: "Descarga en destino" },
  { category: "milestone", code: "CUSTOMS_START",   name: "Inicio de despacho aduanal" },
  { category: "milestone", code: "CUSTOMS_RELEASE", name: "Liberación aduanal" },
  { category: "milestone", code: "IN_WAREHOUSE",    name: "Ingreso a almacén" },
  { category: "milestone", code: "OUT_DELIVERY",    name: "En reparto a destino final" },
  { category: "milestone", code: "POD",             name: "Entregado (POD)" },
  { category: "milestone", code: "SERVICE_START",   name: "Servicio iniciado" },
  { category: "milestone", code: "SERVICE_DONE",    name: "Servicio completado" },
  { category: "milestone", code: "INCIDENT",        name: "Incidencia / Retraso" },
  { category: "milestone", code: "DOCS_COMPLETE",   name: "Documentación completa" },

  // Modos de transporte
  { category: "transport_mode", code: "AIR",    name: "Aéreo" },
  { category: "transport_mode", code: "SEA",    name: "Marítimo" },
  { category: "transport_mode", code: "LAND",   name: "Terrestre" },
  { category: "transport_mode", code: "RAIL",   name: "Ferroviario" },
  { category: "transport_mode", code: "MULTI",  name: "Multimodal" },

  // Tipos de carga
  { category: "cargo_type", code: "GENERAL",    name: "Carga general" },
  { category: "cargo_type", code: "BULK",       name: "Granel" },
  { category: "cargo_type", code: "CONTAINER",  name: "Contenedor" },
  { category: "cargo_type", code: "PERISHABLE", name: "Perecedero" },
  { category: "cargo_type", code: "HAZMAT",     name: "Material peligroso" },
  { category: "cargo_type", code: "OVERSIZED",  name: "Sobredimensionada" },
  { category: "cargo_type", code: "VALUABLES",  name: "Valores / Alto valor" },

  // Tipos de contenedor (ISO) — modalidad contenerizada
  { category: "container_type", code: "20DV", name: "20' Estándar (Dry Van)" },
  { category: "container_type", code: "40DV", name: "40' Estándar (Dry Van)" },
  { category: "container_type", code: "40HC", name: "40' High Cube" },
  { category: "container_type", code: "20RF", name: "20' Refrigerado (Reefer)" },
  { category: "container_type", code: "40RF", name: "40' Refrigerado (Reefer)" },
  { category: "container_type", code: "20OT", name: "20' Open Top" },
  { category: "container_type", code: "40OT", name: "40' Open Top" },
  { category: "container_type", code: "20FR", name: "20' Flat Rack" },
  { category: "container_type", code: "40FR", name: "40' Flat Rack" },
  { category: "container_type", code: "20TK", name: "20' Tanque (Tank)" },

  // Incoterms 2020
  { category: "incoterm", code: "EXW", name: "EXW – Ex Works" },
  { category: "incoterm", code: "FCA", name: "FCA – Free Carrier" },
  { category: "incoterm", code: "CPT", name: "CPT – Carriage Paid To" },
  { category: "incoterm", code: "CIP", name: "CIP – Carriage and Insurance Paid To" },
  { category: "incoterm", code: "DAP", name: "DAP – Delivered at Place" },
  { category: "incoterm", code: "DPU", name: "DPU – Delivered at Place Unloaded" },
  { category: "incoterm", code: "DDP", name: "DDP – Delivered Duty Paid" },
  { category: "incoterm", code: "FAS", name: "FAS – Free Alongside Ship" },
  { category: "incoterm", code: "FOB", name: "FOB – Free on Board" },
  { category: "incoterm", code: "CFR", name: "CFR – Cost and Freight" },
  { category: "incoterm", code: "CIF", name: "CIF – Cost, Insurance and Freight" },

  // Puertos y aeropuertos frecuentes MX
  { category: "port", code: "MEX",  name: "AICM – Ciudad de México" },
  { category: "port", code: "GDL",  name: "Aeropuerto de Guadalajara" },
  { category: "port", code: "MTY",  name: "Aeropuerto de Monterrey" },
  { category: "port", code: "CUN",  name: "Aeropuerto de Cancún" },
  { category: "port", code: "VERA", name: "Puerto de Veracruz" },
  { category: "port", code: "MANZ", name: "Puerto de Manzanillo" },
  { category: "port", code: "LAZA", name: "Puerto de Lázaro Cárdenas" },
  { category: "port", code: "ENSE", name: "Puerto de Ensenada" },
  { category: "port", code: "TAMP", name: "Puerto de Tampico" },
  { category: "port", code: "ALTR", name: "Altamira" },

  // País fiscal / operativo (ISO 3166-1 alpha-2)
  { category: "country", code: "MX", name: "México" },
  { category: "country", code: "US", name: "Estados Unidos" },
  { category: "country", code: "CA", name: "Canadá" },
  { category: "country", code: "CN", name: "China" },
  { category: "country", code: "ES", name: "España" },
  { category: "country", code: "GT", name: "Guatemala" },
  { category: "country", code: "BZ", name: "Belice" },

  // Monedas frecuentes (ISO 4217)
  { category: "currency", code: "MXN", name: "Peso mexicano" },
  { category: "currency", code: "USD", name: "Dólar estadounidense" },
  { category: "currency", code: "CAD", name: "Dólar canadiense" },
  { category: "currency", code: "EUR", name: "Euro" },
  { category: "currency", code: "CNY", name: "Yuan chino" },

  // Claves de producto/servicio SAT (forwarding)
  { category: "sat_product_key", code: "78101800", name: "Transporte de carga general" },
  { category: "sat_product_key", code: "78101801", name: "Transporte de carga aérea" },
  { category: "sat_product_key", code: "78101802", name: "Transporte de carga marítima" },
  { category: "sat_product_key", code: "78101803", name: "Transporte de carga ferroviaria" },
  { category: "sat_product_key", code: "78102200", name: "Servicios de agencia de transporte" },
  { category: "sat_product_key", code: "78121600", name: "Servicios de almacenamiento" },
  { category: "sat_product_key", code: "80141600", name: "Servicios de logística" },
  { category: "sat_product_key", code: "80141603", name: "Servicios de gestión de cadena de suministro" },

  // Claves de unidad SAT
  { category: "sat_unit_key", code: "E48", name: "Unidad de servicio" },
  { category: "sat_unit_key", code: "KGM", name: "Kilogramo" },
  { category: "sat_unit_key", code: "TNE", name: "Tonelada métrica" },
  { category: "sat_unit_key", code: "LTR", name: "Litro" },
  { category: "sat_unit_key", code: "MTR", name: "Metro" },
  { category: "sat_unit_key", code: "MTK", name: "Metro cuadrado" },
  { category: "sat_unit_key", code: "MTQ", name: "Metro cúbico" },
  { category: "sat_unit_key", code: "XBX", name: "Caja" },
  { category: "sat_unit_key", code: "XPK", name: "Paquete" },
  { category: "sat_unit_key", code: "XPL", name: "Plataforma" },
  { category: "sat_unit_key", code: "H87", name: "Pieza" },

  // Uso CFDI, régimen fiscal, formas/métodos de pago y tipo de comprobante:
  // ahora se siembran completos desde SAT_CATALOG_SEEDS (ver sat-catalogs.seed.ts).

  // Carta Porte — Configuración vehicular (c_ConfigAutotransporte)
  { category: "cp_config_vehicular", code: "VL",   name: "VL - Vehículo ligero de carga" },
  { category: "cp_config_vehicular", code: "C2",   name: "C2 - Camión unitario (2 ejes)" },
  { category: "cp_config_vehicular", code: "C3",   name: "C3 - Camión unitario (3 ejes)" },
  { category: "cp_config_vehicular", code: "C2R2", name: "C2R2 - Camión-remolque (4 ejes)" },
  { category: "cp_config_vehicular", code: "C3R2", name: "C3R2 - Camión-remolque (5 ejes)" },
  { category: "cp_config_vehicular", code: "C3R3", name: "C3R3 - Camión-remolque (6 ejes)" },
  { category: "cp_config_vehicular", code: "T3S2", name: "T3S2 - Tractocamión articulado (5 ejes)" },
  { category: "cp_config_vehicular", code: "T3S3", name: "T3S3 - Tractocamión articulado (6 ejes)" },
  { category: "cp_config_vehicular", code: "T3S2R4", name: "T3S2R4 - Tractocamión semirremolque-remolque" },

  // Carta Porte — Tipo de permiso SCT (c_TipoPermiso)
  { category: "cp_perm_sct", code: "TPAF01", name: "TPAF01 - Autotransporte Federal de carga general" },
  { category: "cp_perm_sct", code: "TPAF02", name: "TPAF02 - Transporte privado de carga" },
  { category: "cp_perm_sct", code: "TPAF04", name: "TPAF04 - Materiales y residuos peligrosos" },
  { category: "cp_perm_sct", code: "TPAF05", name: "TPAF05 - Objetos voluminosos y/o de gran peso" },
  { category: "cp_perm_sct", code: "TPXX00", name: "TPXX00 - Permiso no contemplado en el catálogo" },
]

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Sembrando datos iniciales...")

  // Admin por defecto
  const existing = await prisma.user.findUnique({ where: { email: "admin@hmsistema.mx" } })
  if (!existing) {
    await auth.api.signUpEmail({
      body: {
        name: "Administrador",
        email: "admin@hmsistema.mx",
        password: process.env["ADMIN_SEED_PASSWORD"] ?? "Admin1234!",
      },
    })
    await prisma.user.update({
      where: { email: "admin@hmsistema.mx" },
      data: { role: "admin" },
    })
    console.log("✓ Usuario admin creado: admin@hmsistema.mx")
  }

  // Cliente de prueba — SOLO fuera de producción (no ensuciar el padrón real)
  if (process.env["NODE_ENV"] !== "production") {
    let customer = await prisma.customer.findFirst({ where: { rfc: "XAXX010101000" } })
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          name: "Cliente de Prueba SA de CV",
          rfc: "XAXX010101000",
          email: "prueba@ejemplo.com",
        },
      })
    }
    console.log(`✓ Cliente de prueba: ${customer.name}`)
  }

  // Catálogos default — crea solo si no existe un activo con ese (category, code).
  // (Ya no hay unique compuesto: la unicidad es parcial entre activos.)
  let catalogCount = 0
  for (const item of [...CATALOG_SEEDS, ...SAT_CATALOG_SEEDS]) {
    const exists = await prisma.catalogItem.findFirst({
      where: { category: item.category, code: item.code, active: true },
    })
    const extra = (item as { extra?: unknown }).extra
    if (!exists) {
      await prisma.catalogItem.create({
        data: {
          category: item.category, code: item.code, name: item.name,
          extra: extra ? (extra as Prisma.InputJsonValue) : Prisma.JsonNull,
          active: true,
        },
      })
    } else if (extra && JSON.stringify(exists.extra) !== JSON.stringify(extra)) {
      // mantiene al día las banderas (persona física/moral, autotransporte...)
      await prisma.catalogItem.update({ where: { id: exists.id }, data: { extra: extra as Prisma.InputJsonValue } })
    }
    catalogCount++
  }
  console.log(`✓ ${catalogCount} ítems de catálogo verificados`)

  // Plantillas de workflow (Flete terrestre + tramo)
  await seedWorkflowTemplates()

  console.log("Seed completado.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
