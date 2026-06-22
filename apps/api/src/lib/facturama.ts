// Cliente para Facturama API (CFDI 4.0)
// Docs: https://apisandbox.facturama.mx/docs

const BASE_URL = process.env["FACTURAMA_SANDBOX"] === "true"
  ? "https://apisandbox.facturama.mx"
  : "https://api.facturama.mx"

function getAuthHeader() {
  const user = process.env["FACTURAMA_USER"]
  const password = process.env["FACTURAMA_PASSWORD"]
  if (!user || !password) throw new Error("Credenciales de Facturama no configuradas")
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`
}

async function facturamaFetch(path: string, options: RequestInit = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(`Facturama error ${response.status}: ${JSON.stringify(error)}`)
  }

  return response.json()
}

export interface FacturamaItem {
  Quantity: number
  ProductCode: string     // Clave SAT
  UnitCode: string        // Clave unidad SAT (ej: "E48" = Unidad de servicio)
  Unit: string
  Description: string
  IdentificationNumber?: string
  UnitPrice: number
  Subtotal: number
  TaxObject: string       // "02" = Sí objeto de impuesto
  Taxes: {
    Total: number
    Name: string          // "IVA"
    Base: number
    Rate: number          // 0.16
    IsRetention: boolean
  }[]
  Total: number
}

export interface FacturамаCFDIPayload {
  Serie?: string  // debe estar registrada en la sucursal de Facturama; si se omite, Facturama asigna
  Date?: string   // fecha de emisión "yyyy-MM-ddTHH:mm:ss"; si se omite, Facturama usa la hora del servidor
  Currency: string
  ExpeditionPlace: string  // CP del emisor
  PaymentForm: string      // "03" = Transferencia
  PaymentMethod: string    // "PUE" = Pago en una sola exhibición
  CfdiType: "I" | "T"      // I = Ingreso (default), T = Traslado (carga propia)
  Receiver: {
    Rfc: string
    Name: string
    CfdiUse: string        // "G03" = Gastos en general
    FiscalRegime: string   // "616" = Sin obligaciones fiscales
    TaxZipCode: string
    TaxResidence?: string  // c_Pais (solo receptor extranjero, ej. "USA")
    NumRegIdTrib?: string  // Tax ID extranjero (solo receptor extranjero)
  }
  Items: FacturamaItem[]
  Complemento?: unknown    // p. ej. { CartaPorte31: { ... } }
}

export async function createCFDI(payload: FacturамаCFDIPayload) {
  return facturamaFetch("/api/3/cfdis", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export async function cancelCFDI(cfdiId: string, motive: string = "02") {
  return facturamaFetch(`/api/cfdis/${cfdiId}?type=issued&motive=${motive}`, {
    method: "DELETE",
  })
}

export async function getCFDIPdf(cfdiId: string): Promise<string> {
  // OJO: el recurso de descarga es "Cfdi" (singular); "cfdis" (plural) da 404.
  const response = await facturamaFetch(`/api/Cfdi/pdf/issued/${cfdiId}`)
  return response.Content // base64
}

export async function getCFDIXml(cfdiId: string): Promise<string> {
  const response = await facturamaFetch(`/api/Cfdi/xml/issued/${cfdiId}`)
  return response.Content // base64
}

// Extrae la identidad fiscal del CFDI directamente del XML timbrado (fuente canónica):
// - uuid  = TimbreFiscalDigital@UUID (folio fiscal, identificador SAT del comprobante)
// - serie/folio = atributos del nodo raíz cfdi:Comprobante (los que asigna/estampa el PAC)
// Robusto frente a la forma del JSON de Facturama, que varía entre versiones de su API.
export function parseCfdiIdentifiers(xml: string): { uuid?: string; serie?: string; folio?: string } {
  // UUID: anclado al nodo TimbreFiscalDigital — si el CFDI tiene CfdiRelacionados
  // (sustitución), el primer UUID del XML sería el del relacionado, no el del timbre.
  const uuid =
    xml.match(/TimbreFiscalDigital\b[^>]*\bUUID="([^"]+)"/i)?.[1] ??
    xml.match(/\bUUID="([^"]+)"/i)?.[1]
  // Serie/Folio: atributos del nodo raíz Comprobante (el primer tag del documento).
  const comprobante = xml.match(/<[A-Za-z]*:?Comprobante\b[^>]*>/)?.[0] ?? xml.slice(0, 2000)
  const serie = comprobante.match(/\bSerie="([^"]*)"/)?.[1]
  const folio = comprobante.match(/\bFolio="([^"]*)"/)?.[1]
  return {
    ...(uuid ? { uuid } : {}),
    ...(serie ? { serie } : {}),
    ...(folio ? { folio } : {}),
  }
}
