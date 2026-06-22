// Cálculo de impuestos CFDI 4.0 para servicios de forwarding (flete terrestre).
//
// Reglas SAT aplicadas:
// - IVA trasladado 16% sobre el valor de los servicios (tasa general).
// - Retención de IVA 4% sobre el autotransporte TERRESTRE de carga, SOLO cuando el
//   receptor es persona MORAL (LIVA Art. 1-A fr. II inciso c) + Reglamento Art. 3, que
//   fija la retención en 4% del valor de la contraprestación). Persona física no retiene.
// - Conceptos que no son autotransporte (maniobras, casetas, almacenaje) llevan IVA 16%
//   pero NO retención.
//
// NOTA: confirma con tu contador casos especiales (mercancías exentas/tasa 0%, comercio
// exterior). Aquí se cubre el caso general del flete terrestre nacional.

export type Persona = "fisica" | "moral" | null

export interface TaxableItem { amount: number; productCode?: string | null }
export interface TaxResult {
  subtotal: number
  ivaTraslado: number      // 16%
  ivaRetencion: number     // 4% autotransporte a receptor PM
  total: number            // subtotal + IVA traslado − retención
  retentionApplies: boolean
}

export const IVA_RATE = 0.16
export const IVA_RETENTION_RATE = 0.04

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Persona moral = RFC de 12 caracteres; física = 13. (Respaldo cuando no hay régimen.)
export function personaFromRfc(rfc?: string | null): Persona {
  const len = (rfc ?? "").trim().length
  if (len === 12) return "moral"
  if (len === 13) return "fisica"
  return null
}

// Autotransporte terrestre de carga (c_ClaveProdServ "Transporte de carga por carretera"
// = prefijo 781018). Es el concepto sujeto a la retención de IVA del 4%.
export function isAutotransporteCarga(productCode?: string | null): boolean {
  return typeof productCode === "string" && productCode.startsWith("781018")
}

export function computeTaxes(items: TaxableItem[], receptor: Persona): TaxResult {
  // Impuestos POR LÍNEA (redondeados) y luego sumados — así el total coincide con el
  // CFDI: Facturama calcula/estampa el IVA por concepto y suma. Calcular el IVA sobre el
  // subtotal agregado puede diferir 1-2 centavos cuando hay varios conceptos.
  const lines = items.map((i) => {
    const amount = round2(Number(i.amount) || 0)
    const retains = receptor === "moral" && isAutotransporteCarga(i.productCode)
    return {
      amount,
      iva: round2(amount * IVA_RATE),
      ret: retains ? round2(amount * IVA_RETENTION_RATE) : 0,
    }
  })
  const subtotal = round2(lines.reduce((a, l) => a + l.amount, 0))
  const ivaTraslado = round2(lines.reduce((a, l) => a + l.iva, 0))
  const ivaRetencion = round2(lines.reduce((a, l) => a + l.ret, 0))
  const total = round2(subtotal + ivaTraslado - ivaRetencion)
  return { subtotal, ivaTraslado, ivaRetencion, total, retentionApplies: ivaRetencion > 0 }
}
