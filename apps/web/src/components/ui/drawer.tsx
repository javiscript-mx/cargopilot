import { useEffect, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  /** Texto secundario bajo el título */
  description?: string
  children: ReactNode
  /** Acciones fijas al pie (siempre visibles aunque el contenido haga scroll) */
  footer?: ReactNode
  className?: string
}

/**
 * Panel deslizante desde la derecha. Estándar del proyecto para el alta/edición
 * de sub-recursos dentro del detalle de una entidad (unidades, operadores, …).
 * El cuerpo hace scroll y el footer queda fijo.
 */
export function Drawer({ open, onClose, title, description, children, footer, className }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", handler)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", handler)
      document.body.style.overflow = ""
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="animate-overlay-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "animate-drawer-in relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--color-border)] bg-white shadow-xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 transition-colors hover:bg-[var(--color-muted)]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-[var(--color-border)] px-6 py-4">{footer}</div>}
      </div>
    </div>
  )
}
