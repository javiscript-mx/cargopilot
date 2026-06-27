import { forwardRef, useState, type InputHTMLAttributes, type ChangeEvent, type FocusEvent } from "react"
import { cn } from "@/lib/utils"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

// Tipos cuyo valor el navegador deja vacío ("") cuando está a medio llenar, marcando
// validity.badInput (p. ej. datetime-local sin AM/PM). Lo detectamos en blur para avisar
// al usuario en vez de aparentar que el campo quedó completo.
const PARTIAL_TYPES = new Set(["date", "datetime-local", "time", "month", "week"])

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, type, onBlur, onChange, ...props }, ref) => {
    const [incomplete, setIncomplete] = useState(false)
    const tracksPartial = PARTIAL_TYPES.has(type ?? "")

    const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
      if (tracksPartial) setIncomplete(e.currentTarget.validity.badInput)
      onBlur?.(e)
    }
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (incomplete) setIncomplete(false) // al completarse, el value deja de ser ""
      onChange?.(e)
    }

    // Un error explícito del formulario (validación de submit) tiene prioridad sobre el
    // aviso local de "incompleto".
    const incompleteMsg = type === "date" ? "Fecha incompleta" : "Hora incompleta — revisa AM/PM"
    const shownError = error ?? (incomplete ? incompleteMsg : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[var(--color-foreground)]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          type={type}
          onBlur={handleBlur}
          onChange={handleChange}
          aria-invalid={shownError ? true : undefined}
          className={cn(
            "h-10 w-full rounded-md border border-[var(--color-border)] bg-white",
            "px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            shownError && "border-[var(--color-destructive)] bg-red-50/40 ring-1 ring-[var(--color-destructive)]/40",
            className,
          )}
          {...props}
        />
        {shownError && <p className="text-xs text-[var(--color-destructive)]">{shownError}</p>}
      </div>
    )
  },
)
Input.displayName = "Input"
