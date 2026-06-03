import { prisma } from "./client.js"
import { auth } from "../lib/auth.js"

async function main() {
  console.log("Sembrando datos iniciales...")

  // Admin por defecto
  const existing = await prisma.user.findUnique({ where: { email: "admin@hmsistema.mx" } })
  if (!existing) {
    await auth.api.signUpEmail({
      body: {
        name: "Administrador",
        email: "admin@hmsistema.mx",
        password: process.env["ADMIN_SEED_PASSWORD"] ?? "Admin1234!",
      },
    })
    await prisma.user.update({
      where: { email: "admin@hmsistema.mx" },
      data: { role: "admin" },
    })
    console.log("✓ Usuario admin creado: admin@hmsistema.mx")
  }

  // Cliente de prueba
  const customer = await prisma.customer.upsert({
    where: { rfc: "XAXX010101000" },
    update: {},
    create: {
      name: "Cliente de Prueba SA de CV",
      rfc: "XAXX010101000",
      email: "prueba@ejemplo.com",
    },
  })
  console.log(`✓ Cliente de prueba: ${customer.name}`)

  console.log("Seed completado.")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
