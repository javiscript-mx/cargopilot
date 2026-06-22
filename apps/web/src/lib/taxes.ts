import type { PersonaType } from "@/lib/fiscal"

// Espejo de apps/api/src/lib/taxes.ts (mismas reglas SAT) para mostrar IVA + retención
// en la cotización y la factura ANTES de timbrar. La fuente de verdad al timbrar es el API.
// - IVA trasladado 16%.
// - Retención de IVA 4% sobre autotransporte terrestre de carga (prefijo 781018) cuando
//   el receptor es persona MORAL. PF no retiene; conceptos no-flete no retienen.

export const IVA_RATE = 0.16
export const IVA_RETENTION_RATE = 0.04
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function isAutotransporteCarga(productCode?: string | null): boolean {
  return typeof productCode === "string" && productCode.startsWith("781018")
}

export interface TaxableItem { amount: number; productCode?: string | null }
export interface TaxResult {
  subtotal: number
  ivaTraslado: number
  ivaRetencion: number
  total: number
  retentionApplies: boolean
}

export function computeTaxes(items: TaxableItem[], receptor: PersonaType | null): TaxResult {
  // Impuestos POR LÍNEA (redondeados) y luego sumados — espejo exacto del API para que
  // el preview cuadre con el CFDI que estampa Facturama (IVA por concepto, no agregado).
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
