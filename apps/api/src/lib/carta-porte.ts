// Armado del complemento Carta Porte 3.1 para Facturama + verificación de completitud.
// El complemento es por UNIDAD (1 unidad motriz = 1 Carta Porte). La unidad arrastra
// su vehículo, operador y la mercancía que transporta; el tramo aporta ubicaciones y distancia.

import type { Prisma } from "@prisma/client"

type Leg = Prisma.ShipmentLegGetPayload<{}>
type Unit = Prisma.LegVehicleGetPayload<{}>
type Vehicle = Prisma.VehicleGetPayload<{}> | null
type Operator = Prisma.OperatorGetPayload<{}> | null
type Merch = Prisma.MerchandiseGetPayload<{}>

interface LegLoc { name?: string; rfc?: string; zip?: string; address?: string; state?: string; municipality?: string }
const asLoc = (v: unknown): LegLoc => (v ?? {}) as LegLoc

export interface CartaPorteContext {
  leg: Leg
  unit: Unit
  vehicle: Vehicle
  operator: Operator
  merchandise: Merch[] // ya filtrada a la unidad
}

// ── Verificación de completitud: devuelve exactamente qué falta para timbrar ──
// Agrupada por sección para que la UI muestre un checklist accionable.
export interface ReadinessGroup { group: string; items: { label: string; ok: boolean }[] }

export function cartaPorteReadiness(ctx: CartaPorteContext): { ready: boolean; groups: ReadinessGroup[] } {
  const o = asLoc(ctx.leg.origin)
  const d = asLoc(ctx.leg.destination)
  const v = ctx.vehicle
  const op = ctx.operator
  const m = ctx.merchandise

  const dist = ctx.leg.distanceKm != null ? Number(ctx.leg.distanceKm) : 0
  const groups: ReadinessGroup[] = [
    {
      group: "Origen",
      items: [
        { label: "CP de origen", ok: Boolean(o.zip) },
        { label: "Estado de origen", ok: Boolean(o.state) },
        { label: "RFC de origen", ok: Boolean(o.rfc) },
      ],
    },
    {
      group: "Destino",
      items: [
        { label: "CP de destino", ok: Boolean(d.zip) },
        { label: "Estado de destino", ok: Boolean(d.state) },
        { label: "RFC de destino", ok: Boolean(d.rfc) },
      ],
    },
    {
      group: "Ruta y fechas",
      items: [
        { label: "Distancia recorrida mayor a 0", ok: dist > 0 },
        { label: "Fecha de recolección", ok: Boolean(ctx.leg.actualPickupAt ?? ctx.leg.plannedPickupAt) },
        { label: "Fecha de entrega", ok: Boolean(ctx.leg.actualDeliveryAt ?? ctx.leg.plannedDeliveryAt) },
      ],
    },
    {
      group: "Autotransporte",
      items: [
        { label: "Unidad asignada", ok: Boolean(v) },
        { label: "Placa", ok: Boolean(v?.plates) },
        { label: "Año modelo", ok: Boolean(v?.year) },
        { label: "Configuración vehicular", ok: Boolean(v?.configVehicular) },
        { label: "Permiso SCT + número", ok: Boolean(v?.permSct && v?.permSctNumber) },
        { label: "Seguro de responsabilidad civil", ok: Boolean(v?.insurer && v?.insurancePolicy) },
      ],
    },
    {
      group: "Operador (figura transporte)",
      items: [
        { label: "Operador asignado", ok: Boolean(op) },
        { label: "RFC del operador", ok: Boolean(op?.rfc) },
        { label: "Número de licencia", ok: Boolean(op?.licenseNumber) },
      ],
    },
    {
      group: "Mercancía",
      items: [
        { label: "Al menos una mercancía en la unidad", ok: m.length > 0 },
        { label: "Clave SAT (ClaveProdServCP) en todas", ok: m.length > 0 && m.every((x) => Boolean(x.productKey)) },
        { label: "Clave de unidad en todas", ok: m.length > 0 && m.every((x) => Boolean(x.unitKey)) },
        { label: "Peso (kg) en todas", ok: m.length > 0 && m.every((x) => x.weight != null) },
      ],
    },
  ]

  const ready = groups.every((g) => g.items.every((i) => i.ok))
  return { ready, groups }
}

// ── Armado del nodo Complemento.CartaPorte31 para Facturama ──
const fechaSalida = (leg: Leg): string =>
  (leg.actualPickupAt ?? leg.plannedPickupAt ?? new Date()).toISOString().slice(0, 19)
const fechaLlegada = (leg: Leg): string =>
  (leg.actualDeliveryAt ?? leg.plannedDeliveryAt ?? new Date()).toISOString().slice(0, 19)

export function buildCartaPorteComplemento(ctx: CartaPorteContext) {
  const o = asLoc(ctx.leg.origin)
  const d = asLoc(ctx.leg.destination)
  const v = ctx.vehicle!
  const op = ctx.operator!
  const dist = ctx.leg.distanceKm != null ? Number(ctx.leg.distanceKm) : 0

  const pesoTotal = ctx.merchandise.reduce((acc, m) => acc + (m.weight != null ? Number(m.weight) : 0), 0)

  const remolques = [
    ctx.unit.trailer1Plate ? { SubTipoRem: ctx.unit.trailer1Type ?? "CTR004", Placa: ctx.unit.trailer1Plate } : null,
    ctx.unit.trailer2Plate ? { SubTipoRem: ctx.unit.trailer2Type ?? "CTR004", Placa: ctx.unit.trailer2Plate } : null,
  ].filter(Boolean)

  return {
    CartaPorte31: {
      TranspInternac: "No",
      TotalDistRec: dist,
      Ubicaciones: [
        {
          TipoUbicacion: "Origen",
          RFCRemitenteDestinatario: o.rfc || "XAXX010101000",
          FechaHoraSalidaLlegada: fechaSalida(ctx.leg),
          Domicilio: { Estado: o.state ?? null, Pais: "MEX", CodigoPostal: o.zip },
        },
        {
          TipoUbicacion: "Destino",
          RFCRemitenteDestinatario: d.rfc || "XAXX010101000",
          FechaHoraSalidaLlegada: fechaLlegada(ctx.leg),
          DistanciaRecorrida: dist,
          Domicilio: { Estado: d.state ?? null, Pais: "MEX", CodigoPostal: d.zip },
        },
      ],
      Mercancias: {
        PesoBrutoTotal: pesoTotal,
        UnidadPeso: "KGM",
        NumTotalMercancias: ctx.merchandise.length,
        Mercancia: ctx.merchandise.map((m) => ({
          BienesTransp: m.productKey,
          Descripcion: m.description,
          Cantidad: Number(m.quantity),
          ClaveUnidad: m.unitKey,
          PesoEnKg: m.weight != null ? Number(m.weight) : 0,
          MaterialPeligroso: "No",
        })),
        Autotransporte: {
          PermSCT: v.permSct,
          NumPermisoSCT: v.permSctNumber,
          IdentificacionVehicular: {
            ConfigVehicular: v.configVehicular,
            PlacaVM: v.plates,
            AnioModeloVM: v.year,
            ...(v.grossWeight != null ? { PesoBrutoVehicular: Number(v.grossWeight) } : {}),
          },
          Seguros: { AseguraRespCivil: v.insurer, PolizaRespCivil: v.insurancePolicy },
          ...(remolques.length ? { Remolques: remolques } : {}),
        },
      },
      FiguraTransporte: [
        {
          TipoFigura: "01", // Operador
          RFCFigura: op.rfc,
          NumLicencia: op.licenseNumber,
          NombreFigura: op.name,
        },
      ],
    },
  }
}
