// Importa los catálogos SAT grandes (clave producto/servicio y clave unidad) a tablas dedicadas.
// Idempotente (skipDuplicates). Correr una vez: pnpm --filter @hm/api db:import-sat
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { prisma } from "./client.js"

const dir = join(dirname(fileURLToPath(import.meta.url)), "../../prisma/sat-data")

async function main() {
  const prod = JSON.parse(readFileSync(join(dir, "prodserv.json"), "utf-8")) as
    { code: string; description: string; dangerous: boolean }[]
  const uni = JSON.parse(readFileSync(join(dir, "unidades.json"), "utf-8")) as
    { code: string; name: string; symbol: string | null }[]

  const BATCH = 5000
  let inserted = 0
  for (let i = 0; i < prod.length; i += BATCH) {
    const res = await prisma.satProductKey.createMany({ data: prod.slice(i, i + BATCH), skipDuplicates: true })
    inserted += res.count
  }
  console.log(`✓ SatProductKey: ${inserted} insertados (catálogo: ${prod.length})`)

  const resUni = await prisma.satUnitKey.createMany({ data: uni, skipDuplicates: true })
  console.log(`✓ SatUnitKey: ${resUni.count} insertados (catálogo: ${uni.length})`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
