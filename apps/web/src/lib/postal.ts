// CP mexicano → c_Estado SAT (CFDI 4.0 / Carta Porte).
//
// Los 2 primeros dígitos del CP determinan el estado de forma ÚNICA (estructura SEPOMEX:
// los estados no comparten prefijo). Esto permite autollenar el c_Estado al teclear el CP
// y validar que la región existe, sin cargar el catálogo completo de ~145k CPs.
// La existencia EXACTA del CP (y Municipio/Localidad/Colonia) la valida el PAC (Facturama)
// al timbrar — esa es la red de seguridad fiscal.
//
// Fuente: Anexo de códigos postales mexicanos (SEPOMEX). Cross-check: 28865 → 28 → COL.
// Los códigos c_Estado coinciden con la tabla ESTADOS del leg-drawer (CMX, MEX, …).

// [prefijoInicio, prefijoFin, c_Estado] — rangos de 2 dígitos, inclusivos. Cubren 01–99.
const CP_RANGES: readonly [number, number, string][] = [
  [1, 16, "CMX"], [17, 19, "MEX"], [20, 20, "AGU"], [21, 22, "BCN"], [23, 23, "BCS"],
  [24, 24, "CAM"], [25, 27, "COA"], [28, 28, "COL"], [29, 30, "CHP"], [31, 33, "CHH"],
  [34, 35, "DUR"], [36, 38, "GUA"], [39, 41, "GRO"], [42, 43, "HID"], [44, 49, "JAL"],
  [50, 57, "MEX"], [58, 61, "MIC"], [62, 62, "MOR"], [63, 63, "NAY"], [64, 67, "NLE"],
  [68, 71, "OAX"], [72, 75, "PUE"], [76, 76, "QUE"], [77, 77, "ROO"], [78, 79, "SLP"],
  [80, 82, "SIN"], [83, 85, "SON"], [86, 86, "TAB"], [87, 89, "TAM"], [90, 90, "TLA"],
  [91, 96, "VER"], [97, 97, "YUC"], [98, 99, "ZAC"],
]

/**
 * Código c_Estado SAT del CP por su prefijo de 2 dígitos, o null si no es un prefijo postal
 * mexicano válido (00 no está en uso, o hay menos de 2 dígitos). Acepta CP parcial: con 2
 * dígitos ya resuelve el estado, así el autollenado funciona mientras se teclea.
 */
export function estadoFromCp(cp: string | null | undefined): string | null {
  const digits = (cp ?? "").replace(/\D/g, "")
  if (digits.length < 2) return null
  const prefix = Number(digits.slice(0, 2))
  return CP_RANGES.find(([lo, hi]) => prefix >= lo && prefix <= hi)?.[2] ?? null
}
