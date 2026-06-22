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

/**
 * ¿El régimen fiscal aplica al tipo de persona? Banderas moral/physical del catálogo SAT
 * (601 moral, 605 física, 626 ambos…). Si el régimen no marca ninguna (ambas false, p. ej.
 * 610 Residentes en el Extranjero) NO discrimina → aplica a ambos.
 */
export function regimeAppliesToPersona(
  extra: { moral?: boolean; physical?: boolean } | null | undefined,
  persona: PersonaType | null,
): boolean {
  if (!persona) return true
  const moral = extra?.moral === true
  const physical = extra?.physical === true
  if (!moral && !physical) return true
  return persona === "fisica" ? physical : moral
}
