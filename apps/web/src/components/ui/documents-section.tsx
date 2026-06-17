import { useRef, useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { FileText, Upload, Download, Trash2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { documentsApi, type DocumentEntityType } from "@/api/documents"

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xml,.doc,.docx,.xls,.xlsx"

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
      <span className="text-sm font-medium text-[--color-foreground]">Documentos (opcional)</span>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleSelect} />
      <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-[--color-border] p-3">
        {files.length === 0 ? (
          <p className="text-xs text-[--color-muted-foreground]">
            Constancia fiscal, comprobantes, contratos... Se suben al guardar.
          </p>
        ) : (
          files.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-[--color-muted-foreground]" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-[--color-muted-foreground]">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== idx))}
                className="rounded p-1 text-[--color-muted-foreground] hover:text-[--color-destructive]"
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
      {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
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
}

export function DocumentsSection({ entityType, entityId, readOnly = false, bare = false }: DocumentsSectionProps) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => documentsApi.upload(entityType, entityId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] })
      setError(null)
    },
    onError: (err: Error) => setError(err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: documentsApi.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["documents", entityType, entityId] }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
        setError("Archivo demasiado grande (máx. 15 MB)")
      } else {
        uploadMutation.mutate(file)
      }
    }
    e.target.value = "" // permite re-subir el mismo archivo
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

  const action = !readOnly && storageReady && (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="flex items-center gap-1.5"
        loading={uploadMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-3.5 w-3.5" /> Subir archivo
      </Button>
    </>
  )

  const body = (
    <>
      {!storageReady ? (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Almacenamiento no disponible.
          </div>
        ) : isLoading ? (
          <p className="py-3 text-center text-sm text-[--color-muted-foreground]">Cargando...</p>
        ) : documents.length === 0 ? (
          <p className="py-3 text-center text-sm text-[--color-muted-foreground]">
            Sin documentos. {!readOnly && "Sube constancia fiscal, contratos, comprobantes..."}
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-[--color-border]">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-[--color-muted-foreground]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.originalName}</p>
                  <p className="text-xs text-[--color-muted-foreground]">
                    {formatSize(doc.size)} · {new Date(doc.createdAt).toLocaleDateString("es-MX")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Descargar"
                    onClick={() => handleDownload(doc.id)}
                    className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-[--color-muted] hover:text-[--color-foreground]"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {!readOnly && (
                    <button
                      type="button"
                      title="Eliminar"
                      onClick={() => {
                        if (confirm(`¿Eliminar "${doc.originalName}"?`)) deleteMutation.mutate(doc.id)
                      }}
                      className="rounded p-1.5 text-[--color-muted-foreground] transition-colors hover:bg-red-50 hover:text-[--color-destructive]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      {error && <p className="mt-2 text-xs text-[--color-destructive]">{error}</p>}
    </>
  )

  if (bare) {
    return (
      <div className="flex flex-col gap-3">
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
      <CardContent>{body}</CardContent>
    </Card>
  )
}
