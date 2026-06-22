import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export interface ConfirmOptions {
  title?: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}
// Acepta un objeto de opciones o, por comodidad, solo el mensaje (string) → se trata
// como confirmación destructiva con ese texto como descripción.
type ConfirmFn = (opts?: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

// Reemplazo del confirm() nativo: modal estilizado y promesa-based.
// Uso: const confirm = useConfirm(); if (await confirm("¿Eliminar X?")) { ... }
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>")
  return ctx
}

interface State extends ConfirmOptions { open: boolean }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ open: false })
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized: ConfirmOptions = typeof opts === "string" ? { description: opts, destructive: true } : (opts ?? {})
    setState({ open: true, ...normalized })
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setState((s) => ({ ...s, open: false }))
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={state.open} onClose={() => close(false)} title={state.title ?? "Confirmar"} className="max-w-md">
        <div className="flex flex-col gap-5">
          {state.description && <div className="text-sm text-[var(--color-muted-foreground)]">{state.description}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => close(false)}>{state.cancelLabel ?? "Cancelar"}</Button>
            <Button variant={state.destructive ? "destructive" : "default"} size="sm" onClick={() => close(true)}>{state.confirmLabel ?? "Confirmar"}</Button>
          </div>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
