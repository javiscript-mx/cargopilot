// Clasificación de tipo de persona (CFDI/SAT).
// Fuente autoritativa: el régimen fiscal (banderas moral/física del catálogo).
// Respaldo: longitud del RFC — 12 = persona moral, 13 = persona física.

export type PersonaType = "fisica" | "moral"

export function personaFromRfc(rfc?: string | null): PersonaType | null {
  const len = (rfc ?? "").trim().length
  if (len === 13) return "fisica"
  if (len === 12) return "moral"
  return null
}

export function personaType(
  rfc?: string | null,
  regimeExtra?: { moral?: boolean; physical?: boolean } | null,
): PersonaType | null {
  if (regimeExtra?.physical && !regimeExtra.moral) return "fisica"
  if (regimeExtra?.moral && !regimeExtra.physical) return "moral"
  return personaFromRfc(rfc)
}

export const PERSONA_LABEL: Record<PersonaType, string> = {
  fisica: "Persona física",
  moral: "Persona moral",
}
