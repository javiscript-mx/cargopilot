// Armado del complemento Carta Porte 3.1 para Facturama + verificación de completitud.
// El complemento es por UNIDAD (1 unidad motriz = 1 Carta Porte). La unidad arrastra
// su vehículo, operador y la mercancía que transporta; el tramo aporta ubicaciones y distancia.

import type { Prisma } from "@prisma/client"
import { prisma } from "../db/client.js"

type Leg = Prisma.ShipmentLegGetPayload<{}>
type Unit = Prisma.LegVehicleGetPayload<{}>
type Vehicle = Prisma.VehicleGetPayload<{}> | null
type Operator = Prisma.OperatorGetPayload<{}> | null
type Merch = Prisma.MerchandiseGetPayload<{}>

interface LegLoc { name?: string; rfc?: string; zip?: string; address?: string; state?: string; municipality?: string }
const asLoc = (v: unknown): LegLoc => (v ?? {}) as LegLoc

// Tope legal de peso de carga para una unidad terrestre (config full + permiso, NOM-012).
export const LEGAL_MAX_PAYLOAD_KG = 75500

export interface CartaPorteContext {
  leg: Leg
  unit: Unit
  vehicle: Vehicle
  operator: Operator
  merchandise: Merch[] // ya filtrada a la unidad
}

// Carga el contexto de Carta Porte de una unidad (motriz + operador + mercancía del tramo).
// Compartido por el timbrado por unidad (process.ts) y por la factura con complemento (invoices.ts).
export async function loadCartaPorteContext(unitId: string): Promise<CartaPorteContext | null> {
  const unit = await prisma.legVehicle.findUnique({ where: { id: unitId } })
  if (!unit) return null
  const leg = await prisma.shipmentLeg.findUnique({ where: { id: unit.legId } })
  if (!leg) return null
  const [vehicle, operator, merchandise] = await Promise.all([
    unit.vehicleId ? prisma.vehicle.findUnique({ where: { id: unit.vehicleId } }) : Promise.resolve(null),
    unit.operatorId ? prisma.operator.findUnique({ where: { id: unit.operatorId } }) : Promise.resolve(null),
    // Mercancía de esta unidad: asignada explícitamente a la unidad, o al tramo sin unidad concreta
    prisma.merchandise.findMany({
      where: { legAssignments: { some: { OR: [{ legVehicleId: unitId }, { legId: unit.legId, legVehicleId: null }] } } },
    }),
  ])
  return { leg, unit, vehicle, operator, merchandise }
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
  const pesoCargaTotal = m.reduce((acc, x) => acc + (x.weight != null ? Number(x.weight) : 0), 0)
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
        // No se timbra carga con sobrepeso (incongruencia que el SAT/ley no permite)
        { label: `Peso de la carga dentro del límite legal (≤ ${LEGAL_MAX_PAYLOAD_KG.toLocaleString("es-MX")} kg)`, ok: pesoCargaTotal <= LEGAL_MAX_PAYLOAD_KG },
      ],
    },
  ]

  const ready = groups.every((g) => g.items.every((i) => i.ok))
  return { ready, groups }
}

// ── Armado del nodo Complemento.CartaPorte31 para Facturama ──

// El SAT exige la fecha/hora en HORA LOCAL del lugar (sin zona). `toISOString()` da
// UTC (6 h adelante en México) → timbraría una recolección de las 14:00 como 20:00.
// Formateamos las componentes de reloj de pared en la zona del emisor.
export const EMISOR_TIMEZONE = "America/Mexico_City"

export function fechaLocalCfdi(date: Date, timeZone: string = EMISOR_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  const hour = get("hour") === "24" ? "00" : get("hour") // en-CA emite "24" a medianoche
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`
}

const fechaSalida = (leg: Leg): string =>
  fechaLocalCfdi(leg.actualPickupAt ?? leg.plannedPickupAt ?? new Date())
const fechaLlegada = (leg: Leg): string =>
  fechaLocalCfdi(leg.actualDeliveryAt ?? leg.plannedDeliveryAt ?? new Date())

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
