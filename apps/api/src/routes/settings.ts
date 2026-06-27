import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"

// Default values used when a setting hasn't been saved yet
export const SETTING_DEFAULTS: Record<string, unknown> = {
  "general.businessName": "HM Sistema",
  "general.timezone": "America/Mexico_City",
  "maps.countries": ["mx"],
  "invoicing.series": "A",
  "invoicing.emisorName": "",
  "invoicing.emisorRfc": "",
  "invoicing.emisorCp": "",
  "invoicing.regimenFiscal": "601",
  "shipments.folioPrefix": "EXP",
  "storage.bucket": "",
  "appearance.primaryColor": "#284a70",
  "appearance.accentColor": "#f49c2f",
  "appearance.menuColor": "#111d2d",
  // Contacto comercial de la empresa (membretes/POD que ve el cliente; ≠ datos fiscales del CFDI)
  "company.phone": "",
  "company.email": "",
  "company.website": "",
  "company.address": "",
}

const PatchSettingsSchema = z.record(z.string(), z.unknown())

export async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings — returns all settings merged with defaults (any authenticated user)
  app.get("/settings", { preHandler: [requireAuth] }, async () => {
    const rows = await prisma.setting.findMany()
    const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]))
    return { ...SETTING_DEFAULTS, ...saved }
  })

  // PATCH /api/settings — upserts one or more keys (admin only)
  app.patch(
    "/settings",
    { preHandler: [requireAuth, requirePermission("settings.manage")] },
    async (request, reply) => {
      const parsed = PatchSettingsSchema.safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: "Body inválido" })

      const userId = (request as { session: { user: { id: string } } }).session.user.id
      const entries = Object.entries(parsed.data)

      await prisma.$transaction(
        entries.map(([key, value]) =>
          prisma.setting.upsert({
            where: { key },
            update: { value: value as never, updatedBy: userId },
            create: { key, value: value as never, updatedBy: userId },
          }),
        ),
      )

      // Return updated full settings
      const rows = await prisma.setting.findMany()
      const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]))
      return { ...SETTING_DEFAULTS, ...saved }
    },
  )
}
