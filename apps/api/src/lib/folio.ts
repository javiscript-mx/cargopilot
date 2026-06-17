import { Prisma } from "@prisma/client"

// Reintenta una creación que asigna folio cuando choca el índice único
// (carrera entre dos altas simultáneas). En cada intento se recalcula el
// folio a partir del máximo existente, así el "perdedor" toma el siguiente.
export async function withFolioRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      const isUnique =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
      if (isUnique && i < attempts - 1) continue
      throw err
    }
  }
  // inalcanzable: el último intento relanza el error
  throw new Error("No se pudo asignar un folio único")
}

// Extrae el sufijo numérico de un folio (ej. "EXP-00042" -> 42, "00042" -> 42).
// El prefijo es solo letras (validado), así el número va después del último "-".
export function folioNumber(folio: string): number {
  const suffix = folio.includes("-") ? folio.slice(folio.lastIndexOf("-") + 1) : folio
  const n = parseInt(suffix, 10)
  return Number.isFinite(n) ? n : 0
}
