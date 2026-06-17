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

// Usos CFDI relevantes para facturación de servicios de forwarding (CFDI 4.0).
// Lista curada para minimizar error — el SAT permite más, pero estos son los del negocio.
// (P01 "Por definir" quedó fuera: no es válido en 4.0.)
export const FORWARDING_CFDI_USES = ["G03", "G01", "G02", "S01"]

/** ¿El uso CFDI aplica al tipo de persona? (item.extra con banderas moral/physical) */
export function cfdiUseAppliesToPersona(
  extra: { moral?: boolean; physical?: boolean } | null | undefined,
  persona: PersonaType | null,
): boolean {
  if (!persona) return true
  return persona === "fisica" ? extra?.physical !== false : extra?.moral !== false
}
