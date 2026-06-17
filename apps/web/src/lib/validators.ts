// Validadores compartidos para formularios.
// Reglas fiscales MX (SAT) y de operación logística.

// RFC SAT: 3 letras (moral) o 4 (física) + fecha AAMMDD + homoclave.
// Acepta los genéricos XAXX010101000 (nacional) y XEXX010101000 (extranjero).
const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/

export function validateRfc(rfc: string, { required = true } = {}): string | undefined {
  const value = rfc.trim().toUpperCase()
  if (!value) return required ? "Requerido" : undefined
  if (value.length < 12 || value.length > 13) return "RFC debe tener 12 (moral) o 13 (física) caracteres"
  if (!RFC_REGEX.test(value)) return "RFC con formato inválido (ej. ABC010101XY9)"
  // Fecha embebida válida (posiciones tras las letras): AAMMDD
  const dateStr = value.slice(value.length - 9, value.length - 3)
  const month = Number(dateStr.slice(2, 4))
  const day = Number(dateStr.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > 31) return "RFC con fecha inválida"
  return undefined
}

export function validateEmail(email: string, { required = false } = {}): string | undefined {
  const value = email.trim()
  if (!value) return required ? "Requerido" : undefined
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return "Correo inválido"
  return undefined
}

export function validatePhone(phone: string, { required = false } = {}): string | undefined {
  const digits = phone.replace(/[\s\-()+ ]/g, "")
  if (!digits) return required ? "Requerido" : undefined
  if (!/^\d{10}$/.test(digits)) return "Teléfono debe tener 10 dígitos"
  return undefined
}

export function validateCp(cp: string, { required = false } = {}): string | undefined {
  const value = cp.trim()
  if (!value) return required ? "Requerido" : undefined
  if (!/^\d{5}$/.test(value)) return "Código postal de 5 dígitos"
  return undefined
}

export function validateRequired(value: string, label = "Este campo"): string | undefined {
  if (!value.trim()) return "Requerido"
  if (value.trim().length < 2) return `${label} demasiado corto`
  return undefined
}

// ── Operación logística ──────────────────────────────────────────────────────

/** Peso en kg: positivo y dentro de un rango operable (hasta 100 ton). */
export function validateWeight(weight: string): string | undefined {
  if (!weight) return undefined // opcional
  const n = parseFloat(weight)
  if (isNaN(n) || n <= 0) return "Peso debe ser mayor a 0"
  if (n > 100_000) return "Peso fuera de rango (máx. 100,000 kg) — verifica la unidad"
  return undefined
}

/** Unidades/bultos: entero positivo razonable. */
export function validateUnits(units: string): string | undefined {
  if (!units) return undefined // opcional
  const n = Number(units)
  if (!Number.isInteger(n) || n <= 0) return "Debe ser un entero mayor a 0"
  if (n > 100_000) return "Cantidad fuera de rango"
  return undefined
}

/** Cantidad de un concepto de factura. */
export function validateQuantity(qty: string): string | undefined {
  const n = parseFloat(qty)
  if (!qty || isNaN(n) || n <= 0) return "Mayor a 0"
  if (n > 1_000_000) return "Fuera de rango"
  return undefined
}

/** Precio unitario: positivo, máx 2 decimales (requisito CFDI). */
export function validateUnitPrice(price: string): string | undefined {
  const n = parseFloat(price)
  if (!price || isNaN(n) || n <= 0) return "Mayor a 0"
  if (n > 100_000_000) return "Fuera de rango"
  if (!/^\d+(\.\d{1,2})?$/.test(price.trim())) return "Máximo 2 decimales"
  return undefined
}

/** Código de catálogo: mayúsculas, números, guiones — sin espacios. */
export function validateCatalogCode(code: string): string | undefined {
  const value = code.trim()
  if (!value) return "Requerido"
  if (!/^[A-Z0-9_-]{1,30}$/.test(value)) return "Solo letras mayúsculas, números, guiones (sin espacios)"
  return undefined
}

/** Serie CFDI: 1-10 caracteres alfanuméricos. */
export function validateSeries(series: string): string | undefined {
  const value = series.trim()
  if (!value) return "Requerido"
  if (!/^[A-Z0-9]{1,10}$/.test(value)) return "Solo letras y números (máx. 10)"
  return undefined
}

/** Prefijo de folio de expedientes. */
export function validateFolioPrefix(prefix: string): string | undefined {
  const value = prefix.trim()
  if (!value) return "Requerido"
  if (!/^[A-Z]{2,10}$/.test(value)) return "Solo letras (2-10 caracteres)"
  return undefined
}

/** Nombre de bucket GCS: minúsculas, números, guiones, puntos; 3-63 chars. */
export function validateGcsBucket(name: string): string | undefined {
  const value = name.trim()
  if (!value) return undefined // opcional — sin bucket simplemente no hay uploads
  if (!/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(value)) {
    return "Nombre inválido — minúsculas, números, guiones y puntos (3-63 caracteres)"
  }
  return undefined
}

/** Quita las llaves con valor undefined — deja solo errores reales. */
export function collectErrors(checks: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, msg] of Object.entries(checks)) {
    if (msg) out[key] = msg
  }
  return out
}
