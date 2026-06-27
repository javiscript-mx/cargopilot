import { useRef, useState, type ReactNode } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Upload, Download, Trash2, AlertCircle, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { documentsApi, type DocumentEntityType } from "@/api/documents"
import { useCatalog } from "@/hooks/use-catalog"
import { useToast } from "@/components/ui/toast"
import { useConfirm } from "@/components/ui/confirm"

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xml,.doc,.docx,.xls,.xlsx"

// El catálogo `document_type` es uno solo (mezcla evidencia operativa con fiscal/legal).
// Cada contexto ofrece SOLO sus tipos → en un expediente ya no aparece "Cotización"/"Factura"
// como "tipo de evidencia" (eso confundía: el usuario pensaba que ahí manejaba la cotización).
const DOC_TYPES_BY_ENTITY: Partial<Record<DocumentEntityType, string[]>> = {
  shipment: ["pod", "evidencia_recoleccion", "foto_mercancia", "carta_instruccion", "otro"],
  supplier: ["constancia_fiscal", "identificacion", "contrato", "otro"],
  customer: ["constancia_fiscal", "identificacion", "contrato", "otro"],
  invoice: ["factura", "cfdi_carta_porte", "otro"],
  expense: ["factura", "otro"],
}
const EMPTY_HINT_BY_ENTITY: Partial<Record<DocumentEntityType, string>> = {
  shipment: "POD/acuse de entrega, fotos de la carga, cartas de instrucción...",
  supplier: "constancia fiscal, identificación, contratos...",
  customer: "constancia fiscal, identificación, contratos...",
  invoice: "representación impresa, acuses...",
  expense: "factura del proveedor, recibo, ticket...",
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Picker para formularios de alta ──────────────────────────────────────────
// La entidad aún no existe al llenar el formulario; los archivos se quedan
// en memoria y el formulario los sube después de crear la entidad.

interface PendingFilesPickerProps {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

export function PendingFilesPicker({ files, onChange, disabled }: PendingFilesPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: status } = useQuery({
    queryKey: ["documents-status"],
    queryFn: documentsApi.status,
    staleTime: 1000 * 60 * 5,
  })

  if (!status?.configured) return null // sin storage no se ofrece la opción

  function handleSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    const tooBig = selected.find((f) => f.size > 15 * 1024 * 1024)
    if (tooBig) {
      setError(`"${tooBig.name}" excede 15 MB`)
    } else {
      setError(null)
      onChange([...files, ...selected])
    }
    e.target.value = ""
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--color-foreground)]">Documentos (opcional)</span>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleSelect} />
      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-[var(--color-border)] p-3">
        {files.length === 0 ? (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            Constancia fiscal, comprobantes, contratos... Se suben al guardar.
          </p>
        ) : (
          files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-[var(--color-muted-foreground)]">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className="mt-1 self-start"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" /> Seleccionar archivos
        </Button>
      </div>
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}

interface DocumentsSectionProps {
  entityType: DocumentEntityType
  entityId: string
  /** Solo lectura (ej. rol viewer) */
  readOnly?: boolean
  /** Sin Card propia ni título — para usar dentro de pestañas u otros contenedores */
  bare?: boolean
  /** Banner de contexto opcional arriba: qué documentos van aquí / a dónde va lo demás */
  intro?: ReactNode
}

export function DocumentsSection({ entityType, entityId, readOnly = false, bare = false, intro }: DocumentsSectionProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  // Form de subida: tipo (catálogo) + observación + archivo
  const [showForm, setShowForm] = useState(false)
  const [kind, setKind] = useState("")
  const [notes, setNotes] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const { simpleOptions: allTypeOptions } = useCatalog("document_type")
  const typeLabel = (code: string | null) => (code ? allTypeOptions.find((o) => o.value === code)?.label ?? code : null)
  // El dropdown de subida ofrece solo los tipos del contexto; el label de docs ya existentes
  // se sigue resolviendo contra el catálogo completo (no se pierde nada de lo ya cargado).
  const allowedTypes = DOC_TYPES_BY_ENTITY[entityType]
  const uploadTypeOptions = allowedTypes ? allTypeOptions.filter((o) => allowedTypes.includes(o.value)) : allTypeOptions

  const { data: status } = useQuery({
    queryKey: ["documents-status"],
    queryFn: documentsApi.status,
    staleTime: 1000 * 60 * 5,
  })

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", entityType, entityId],
    queryFn: () => documentsApi.list(entityType, entityId),
    enabled: Boolean(entityId),
  })

  function resetForm() { setShowForm(false); setKind(""); setNotes(""); setFile(null); setError(null) }

  const uploadMutation = useMutation({
    mutationFn: (f: File) => documentsApi.upload(entityType, entityId, f, { kind: kind || null, notes: notes || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] })
      toast.success("Evidencia subida")
      resetForm()
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] })
      toast.success("Documento eliminado")
    },
    onError: (err: Error) => toast.error("No se pudo eliminar el documento", err.message),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected) {
      if (selected.size > 15 * 1024 * 1024) setError("Archivo demasiado grande (máx. 15 MB)")
      else { setError(null); setFile(selected) }
    }
    e.target.value = "" // permite re-elegir el mismo archivo
  }

  function submitUpload() {
    if (!kind) { setError("Selecciona el tipo de evidencia"); return }
    if (!file) { setError("Selecciona un archivo"); return }
    uploadMutation.mutate(file)
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await documentsApi.downloadUrl(id)
      window.open(url, "_blank")
    } catch {
      setError("No se pudo generar la descarga")
    }
  }

  const storageReady = status?.configured ?? false

  const action = !readOnly && storageReady && !showForm && (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="flex items-center gap-1.5"
      onClick={() => { setShowForm(true); setError(null) }}
    >
      <Upload className="h-3.5 w-3.5" /> Subir evidencia
    </Button>
  )

  const uploadForm = !readOnly && storageReady && showForm && (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nueva evidencia</span>
        <button type="button" onClick={resetForm} className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"><X className="h-4 w-4" /></button>
      </div>
      <Select id="doc-kind" label="Tipo de evidencia" placeholder="Selecciona el tipo..." options={uploadTypeOptions} value={kind} onChange={(e) => setKind(e.target.value)} />
      <Input id="doc-notes" label="Observación (opcional)" placeholder="Referencia, detalle de la evidencia..." value={notes} onChange={(e) => setNotes(e.target.value)} />
      <input ref={fileInputRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFileChange} />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> {file ? "Cambiar archivo" : "Elegir archivo"}
        </Button>
        {file && <span className="min-w-0 flex-1 truncate text-sm text-[var(--color-muted-foreground)]">{file.name} · {formatSize(file.size)}</span>}
      </div>
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={resetForm}>Cancelar</Button>
        <Button type="button" size="sm" loading={uploadMutation.isPending} onClick={submitUpload}>Subir</Button>
      </div>
    </div>
  )

  const body = (
    <>
      {uploadForm}
      {!storageReady ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Almacenamiento no disponible.
          </div>
        ) : isLoading ? (
          <p className="py-3 text-center text-sm text-[var(--color-muted-foreground)]">Cargando...</p>
        ) : documents.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--color-muted-foreground)]">
            Sin documentos. {!readOnly && `Sube ${EMPTY_HINT_BY_ENTITY[entityType] ?? "los comprobantes de la operación..."}`}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.originalName}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    {typeLabel(doc.kind) && <span className="font-medium text-[var(--color-foreground)]">{typeLabel(doc.kind)} · </span>}
                    {formatSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString("es-MX")}
                  </p>
                  {doc.notes && <p className="truncate text-xs text-[var(--color-muted-foreground)]">{doc.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Descargar"
                    onClick={() => handleDownload(doc.id)}
                    className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      title="Eliminar"
                      onClick={async () => {
                        if (await confirm(`¿Eliminar "${doc.originalName}"?`)) deleteMutation.mutate(doc.id)
                      }}
                      className="rounded p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-red-50 hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      {!showForm && error && <p className="mt-2 text-xs text-[var(--color-destructive)]">{error}</p>}
    </>
  )

  if (bare) {
    return (
      <div className="flex flex-col gap-3">
        {intro}
        {action && <div className="flex justify-end">{action}</div>}
        {body}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Documentos</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{intro && <div className="mb-3">{intro}</div>}{body}</CardContent>
    </Card>
  )
}
