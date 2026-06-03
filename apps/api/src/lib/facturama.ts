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
  Serie: string
  Currency: string
  ExpeditionPlace: string  // CP del emisor
  PaymentForm: string      // "03" = Transferencia
  PaymentMethod: string    // "PUE" = Pago en una sola exhibición
  CfdiType: "I"            // I = Ingreso
  Receiver: {
    Rfc: string
    Name: string
    CfdiUse: string        // "G03" = Gastos en general
    FiscalRegime: string   // "616" = Sin obligaciones fiscales
    TaxZipCode: string
  }
  Items: FacturamaItem[]
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
  const response = await facturamaFetch(`/api/cfdis/pdf/issued/${cfdiId}`)
  return response.Content // base64
}

export async function getCFDIXml(cfdiId: string): Promise<string> {
  const response = await facturamaFetch(`/api/cfdis/xml/issued/${cfdiId}`)
  return response.Content // base64
}
