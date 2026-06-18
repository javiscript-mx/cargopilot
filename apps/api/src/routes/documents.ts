import type { FastifyInstance } from "fastify"
import { randomUUID } from "node:crypto"
import { prisma } from "../db/client.js"
import { requireAuth, requirePermission } from "../middleware/require-auth.js"
import { uploadObject, getSignedUrl, streamObject, deleteObject, getStorageStatus } from "../lib/storage.js"

const ENTITY_TYPES = new Set(["customer", "supplier", "shipment", "invoice"])

// Tipos de documento típicos en operación de forwarding:
// constancia fiscal (CSF), comprobante de domicilio, contratos, pólizas, BL, facturas, etc.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/xml",
  "application/xml",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15 MB

export async function documentsRoutes(app: FastifyInstance) {
  // Estado del almacenamiento (la UI siempre puede subir: GCS o disco local)
  app.get("/documents/status", { preHandler: requireAuth }, async (_request, reply) => {
    const status = await getStorageStatus()
    return reply.send({ configured: status.ready, mode: status.mode, bucket: status.bucket })
  })

  // Listar documentos de una entidad
  app.get("/documents", { preHandler: requireAuth }, async (request, reply) => {
    const { entityType, entityId } = request.query as { entityType?: string; entityId?: string }
    if (!entityType || !entityId) {
      return reply.status(400).send({ error: "entityType y entityId son requeridos" })
    }
    const documents = await prisma.document.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "desc" },
    })
    return reply.send(documents)
  })

  // Subir documento (multipart/form-data: file, entityType, entityId)
  app.post(
    "/documents/upload",
    { preHandler: requirePermission("documents.write") },
    async (request, reply) => {
      const file = await request.file()
      if (!file) return reply.status(400).send({ error: "No se recibió ningún archivo" })

      const fields = file.fields as Record<string, { value?: string } | undefined>
      const entityType = fields["entityType"]?.value
      const entityId = fields["entityId"]?.value

      if (!entityType || !ENTITY_TYPES.has(entityType)) {
        return reply.status(400).send({ error: "entityType inválido" })
      }
      if (!entityId) return reply.status(400).send({ error: "entityId requerido" })

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return reply.status(400).send({ error: "Tipo de archivo no permitido (PDF, imágenes, XML, Word, Excel)" })
      }

      const buffer = await file.toBuffer()
      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({ error: "Archivo demasiado grande (máx. 15 MB)" })
      }

      // Verifica que la entidad exista
      const exists =
        entityType === "customer" ? await prisma.customer.findUnique({ where: { id: entityId } })
        : entityType === "supplier" ? await prisma.supplier.findUnique({ where: { id: entityId } })
        : entityType === "shipment" ? await prisma.shipment.findUnique({ where: { id: entityId } })
        : await prisma.invoice.findUnique({ where: { id: entityId } })
      if (!exists) return reply.status(404).send({ error: "Entidad no encontrada" })

      // Sanitiza el nombre para evitar separadores de ruta en la llave del objeto
      const safeName = file.filename.replace(/[/\\]/g, "_")
      const objectPath = `${entityType}/${entityId}/${randomUUID()}-${safeName}`

      try {
        await uploadObject(objectPath, buffer, file.mimetype)
      } catch (err) {
        request.log.error(err, "Error guardando el archivo")
        const message = err instanceof Error ? err.message : "Error al subir el archivo"
        return reply.status(502).send({ error: message })
      }

      const document = await prisma.document.create({
        data: {
          entityType,
          entityId,
          originalName: file.filename,
          mimeType: file.mimetype,
          size: buffer.length,
          gcsPath: objectPath,
          uploadedBy: request.session?.user.id ?? null,
        },
      })
      return reply.status(201).send(document)
    },
  )

  // Resuelve a dónde descargar: URL firmada (GCS) o el endpoint /raw del API (local)
  app.get("/documents/:id/download", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) return reply.status(404).send({ error: "Documento no encontrado" })
    try {
      const signed = await getSignedUrl(document.gcsPath, document.originalName)
      return reply.send({ url: signed ?? `/api/documents/${document.id}/raw` })
    } catch (err) {
      request.log.error(err, "Error generando URL de descarga")
      return reply.status(502).send({ error: "No se pudo generar la URL de descarga" })
    }
  })

  // Sirve el archivo a través del API (modo local). Autenticado por cookie.
  app.get("/documents/:id/raw", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const document = await prisma.document.findUnique({ where: { id } })
    if (!document) return reply.status(404).send({ error: "Documento no encontrado" })
    try {
      const stream = await streamObject(document.gcsPath)
      reply.header("Content-Type", document.mimeType)
      reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(document.originalName)}"`)
      return reply.send(stream)
    } catch (err) {
      request.log.error(err, "Error sirviendo el archivo")
      return reply.status(404).send({ error: "Archivo no disponible" })
    }
  })

  // Eliminar documento (BD + objeto en GCS)
  app.delete(
    "/documents/:id",
    { preHandler: requirePermission("documents.write") },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const document = await prisma.document.findUnique({ where: { id } })
      if (!document) return reply.status(404).send({ error: "Documento no encontrado" })
      try {
        await deleteObject(document.gcsPath)
      } catch (err) {
        request.log.warn(err, "No se pudo borrar el objeto en GCS — se elimina el registro de todas formas")
      }
      await prisma.document.delete({ where: { id } })
      return reply.status(204).send()
    },
  )
}
