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

// Matrícula de contenedor (ISO 6346): 4 letras + 6 dígitos + 1 verificador. El número
// identifica al contenedor (dueño + serie); NO codifica tamaño/tipo (eso es otro código
// ISO aparte, p. ej. 22G1). Lo verificable es el dígito de control: letras→valores 10-38
// (saltando múltiplos de 11), pesos 2^posición, suma mod 11 (resultado 10 ⇒ 0).
const ISO6346_LETTER: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  let val = 10
  for (let i = 0; i < 26; i++) {
    if (val % 11 === 0) val++ // se omiten 11, 22, 33
    map[String.fromCharCode(65 + i)] = val
    val++
  }
  return map
})()

function iso6346CheckDigit(first10: string): number {
  let sum = 0
  for (let p = 0; p < 10; p++) {
    const ch = first10[p]!
    const value = p < 4 ? (ISO6346_LETTER[ch] ?? 0) : Number(ch)
    sum += value * (1 << p) // 2^p
  }
  const cd = sum % 11
  return cd === 10 ? 0 : cd
}

/**
 * Valida una matrícula de contenedor ISO 6346 (4 letras + 7 dígitos, 4ª letra U/J/Z y
 * dígito verificador correcto). Detecta matrículas mal tecleadas. Devuelve un mensaje o
 * undefined. Vacío = sin opinión (campo opcional). Pensado como aviso, no como candado.
 */
export function validateContainerNumber(num: string): string | undefined {
  const v = num.trim().toUpperCase()
  if (!v) return undefined
  if (!/^[A-Z]{4}\d{7}$/.test(v)) return "Formato ISO 6346: 4 letras + 7 dígitos (p. ej. MSKU1234565)."
  if (!"UJZ".includes(v[3]!)) return "La 4ª letra debería ser U, J o Z (categoría de equipo ISO 6346)."
  const expected = iso6346CheckDigit(v.slice(0, 10))
  if (expected !== Number(v[10])) return `El dígito verificador ISO 6346 no cuadra (esperado ${expected}). Revisa la matrícula.`
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

// ── Fechas y horas ───────────────────────────────────────────────────────────
// Trabajan con el string LOCAL de <input type="date"|"datetime-local"> (no ISO).
// Las cadenas "YYYY-MM-DD[THH:mm]" ordenan cronológicamente como texto, así que
// comparamos contra el "ahora" en el mismo formato.

/** "YYYY-MM-DDTHH:mm" del momento actual en hora local (para min/compare de datetime-local). */
export function nowLocal(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/** "YYYY-MM-DD" de hoy en hora local (para min/compare de date). */
export function todayLocal(): string {
  return nowLocal().slice(0, 10)
}

export interface DateFieldOpts {
  required?: boolean
  notPast?: boolean    // rechaza fechas/horas anteriores a ahora (ETA, planeadas, vigencia)
  notFuture?: boolean  // rechaza fechas/horas posteriores a ahora (real ocurrido, pago, gasto)
  minLocal?: string    // cota inferior explícita, mismo formato que value (p. ej. cruce de campos)
  maxLocal?: string    // cota superior explícita
  minMessage?: string  // mensaje propio cuando value < minLocal
  label?: string       // sujeto del mensaje, p. ej. "La entrega (ETA)"
}

/**
 * Valida un valor de <input type="date"|"datetime-local"> (string local, no ISO).
 * Devuelve un mensaje en español o undefined.
 * OJO: NO detecta el caso "a medio llenar" (p. ej. AM/PM faltante) — ahí el navegador
 * deja value="" y se ve igual que vacío. Ese caso lo cubre findIncompleteDateInputs.
 */
export function validateDateField(value: string, opts: DateFieldOpts = {}): string | undefined {
  const { required = false, notPast, notFuture, minLocal, maxLocal, minMessage, label = "La fecha" } = opts
  const v = value.trim()
  if (!v) return required ? "Requerido" : undefined
  const now = v.includes("T") ? nowLocal() : todayLocal()
  if (notPast && v < now) return `${label} no puede ser en el pasado.`
  if (notFuture && v > now) return `${label} no puede ser en el futuro.`
  if (minLocal && v < minLocal) return minMessage ?? `${label} es anterior a la fecha mínima permitida.`
  if (maxLocal && v > maxLocal) return `${label} es posterior a la fecha máxima permitida.`
  return undefined
}

/**
 * Inputs de fecha/hora a medio llenar: el navegador deja value="" pero marca
 * validity.badInput=true (p. ej. datetime-local sin AM/PM, o una fecha incompleta).
 * Devuelve {id, message} de cada uno para marcarlos como error en el submit en vez de
 * tratarlos como vacíos — que es justo lo que confunde al usuario.
 * Acota `root` al <form> para no leer inputs de otros formularios montados detrás.
 */
export function findIncompleteDateInputs(root: ParentNode = document): { id: string; message: string }[] {
  const out: { id: string; message: string }[] = []
  const inputs = root.querySelectorAll<HTMLInputElement>(
    'input[type="datetime-local"], input[type="date"], input[type="time"]',
  )
  inputs.forEach((el) => {
    if (el.validity.badInput && el.id) {
      out.push({ id: el.id, message: el.type === "date" ? "Fecha incompleta" : "Hora incompleta — revisa AM/PM" })
    }
  })
  return out
}

/** Quita las llaves con valor undefined — deja solo errores reales. */
export function collectErrors(checks: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, msg] of Object.entries(checks)) {
    if (msg) out[key] = msg
  }
  return out
}

/**
 * Lleva la vista al primer campo con error tras un submit bloqueado.
 * Los componentes Input/Select renderizan el error como `<p class="text-[var(--color-destructive)]">`.
 * El timeout deja que React pinte los errores antes de buscarlos.
 */
export function scrollToFirstError(): void {
  setTimeout(() => {
    const first = document.querySelector(".text-\\[var\\(--color-destructive\\)\\]")
    first?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, 50)
}
