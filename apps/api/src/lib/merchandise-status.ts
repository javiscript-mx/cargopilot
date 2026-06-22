// Estado AUTOMÁTICO de una partida de mercancía, derivado del progreso de los tramos
// a los que está asignada (no se captura a mano):
//   - delivered  → el último tramo asignado ya tiene entrega real (actualDeliveryAt)
//   - in_custody → un tramo entregó pero el siguiente tramo asignado aún no recoge (bodega/transbordo)
//   - in_transit → en ruta o aún no inicia
export type MerchStatus = "in_transit" | "in_custody" | "delivered"

interface LegProgress { order: number; actualPickupAt: Date | string | null; actualDeliveryAt: Date | string | null }

export function deriveMerchStatus(legs: LegProgress[]): MerchStatus {
  if (legs.length === 0) return "in_transit"
  const sorted = [...legs].sort((a, b) => a.order - b.order)
  const last = sorted[sorted.length - 1]!
  if (last.actualDeliveryAt) return "delivered"
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]!.actualDeliveryAt && !sorted[i + 1]!.actualPickupAt) return "in_custody"
  }
  return "in_transit"
}
