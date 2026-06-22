import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Variant = "success" | "error" | "info"
interface ToastItem { id: number; title: string; description?: string; variant: Variant }

interface ToastApi {
  show: (t: { title: string; description?: string; variant?: Variant }) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>")
  return ctx
}

const VARIANT: Record<Variant, { icon: typeof Info; cls: string; iconCls: string }> = {
  success: { icon: CheckCircle2, cls: "border-green-300 bg-green-50 text-green-900", iconCls: "text-green-600" },
  error:   { icon: AlertCircle,  cls: "border-red-300 bg-red-50 text-red-900",       iconCls: "text-[var(--color-destructive)]" },
  info:    { icon: Info,         cls: "border-[var(--color-border)] bg-white text-[var(--color-foreground)]", iconCls: "text-[var(--color-primary)]" },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback((t: { title: string; description?: string; variant?: Variant }) => {
    const id = ++idRef.current
    const variant = t.variant ?? "info"
    setToasts((prev) => [...prev, { id, title: t.title, description: t.description, variant }])
    setTimeout(() => remove(id), variant === "error" ? 6000 : 3500)
  }, [remove])

  const api: ToastApi = {
    show,
    success: (title, description) => show({ title, description, variant: "success" }),
    error: (title, description) => show({ title, description, variant: "error" }),
    info: (title, description) => show({ title, description, variant: "info" }),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const v = VARIANT[t.variant]
          const Icon = v.icon
          return (
            <div key={t.id} className={cn("animate-toast-in pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg", v.cls)}>
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", v.iconCls)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description && <p className="mt-0.5 break-words text-xs opacity-80">{t.description}</p>}
              </div>
              <button onClick={() => remove(t.id)} className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
