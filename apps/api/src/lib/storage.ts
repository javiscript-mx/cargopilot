import { Storage } from "@google-cloud/storage"
import { createReadStream } from "node:fs"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import type { Readable } from "node:stream"
import { prisma } from "../db/client.js"

// Dos backends de almacenamiento, elegidos automáticamente:
//   • GCS    → si hay GCS_PROJECT_ID (+ bucket configurado en /settings).
//              Credenciales por env: GCS_CREDENTIALS_JSON o GOOGLE_APPLICATION_CREDENTIALS.
//   • Local  → respaldo en disco cuando no hay GCS. Carpeta: DOCS_STORAGE_DIR
//              (default: <cwd>/.storage/documents). En el VPS, montar un volumen ahí.

const LOCAL_DIR = resolve(process.env["DOCS_STORAGE_DIR"] ?? join(process.cwd(), ".storage", "documents"))

let storageClient: Storage | null = null

function getClient(): Storage {
  if (storageClient) return storageClient
  const projectId = process.env["GCS_PROJECT_ID"]
  const credentialsJson = process.env["GCS_CREDENTIALS_JSON"]
  storageClient = credentialsJson
    ? new Storage({ projectId, credentials: JSON.parse(credentialsJson) })
    : new Storage({ projectId })
  return storageClient
}

export async function getBucketName(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "storage.bucket" } })
  const name = setting?.value
  return typeof name === "string" && name.trim() ? name.trim() : null
}

export type StorageMode = "gcs" | "local"

/** GCS si hay credenciales + bucket; si no, disco local (siempre disponible). */
export async function getStorageMode(): Promise<StorageMode> {
  if (process.env["GCS_PROJECT_ID"] && (await getBucketName())) return "gcs"
  return "local"
}

export async function getStorageStatus(): Promise<{ ready: boolean; mode: StorageMode; bucket: string | null }> {
  const mode = await getStorageMode()
  return { ready: true, mode, bucket: mode === "gcs" ? await getBucketName() : null }
}

// Evita escapar de LOCAL_DIR vía rutas con "../"
function localPathFor(objectPath: string): string {
  const full = resolve(LOCAL_DIR, objectPath)
  if (full !== LOCAL_DIR && !full.startsWith(LOCAL_DIR + sep)) {
    throw new Error("Ruta de objeto inválida")
  }
  return full
}

export async function uploadObject(objectPath: string, buffer: Buffer, contentType: string): Promise<void> {
  if ((await getStorageMode()) === "gcs") {
    const bucket = (await getBucketName())!
    await getClient().bucket(bucket).file(objectPath).save(buffer, { contentType, resumable: false })
    return
  }
  const dest = localPathFor(objectPath)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, buffer)
}

/** URL firmada de GCS (15 min). En modo local devuelve null — se descarga vía API. */
export async function getSignedUrl(objectPath: string, fileName: string): Promise<string | null> {
  if ((await getStorageMode()) !== "gcs") return null
  const bucket = (await getBucketName())!
  const [url] = await getClient()
    .bucket(bucket)
    .file(objectPath)
    .getSignedUrl({
      action: "read",
      expires: Date.now() + 15 * 60 * 1000,
      responseDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    })
  return url
}

/** Stream del objeto para servirlo a través del API (modo local, o GCS si se requiere). */
export async function streamObject(objectPath: string): Promise<Readable> {
  if ((await getStorageMode()) === "gcs") {
    const bucket = (await getBucketName())!
    return getClient().bucket(bucket).file(objectPath).createReadStream()
  }
  return createReadStream(localPathFor(objectPath))
}

export async function deleteObject(objectPath: string): Promise<void> {
  if ((await getStorageMode()) === "gcs") {
    const bucket = await getBucketName()
    if (!bucket) return
    await getClient().bucket(bucket).file(objectPath).delete({ ignoreNotFound: true })
    return
  }
  try {
    await unlink(localPathFor(objectPath))
  } catch {
    /* ya no existe — ok */
  }
}
