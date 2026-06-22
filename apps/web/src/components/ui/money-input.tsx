import { forwardRef, useState, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  label?: string
  error?: string
  value: string
  onChange: (value: string) => void
  currency?: string
}

// Formatea un string numérico a miles + 2 decimales (al perder foco)
function formatMoney(raw: string): string {
  if (raw === "" || raw == null) return ""
  const n = Number(raw)
  if (Number.isNaN(n)) return raw
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Deja solo dígitos y un punto decimal
const clean = (s: string) => s.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1")

// Input de dinero: prefijo "$", alineado a la derecha, con formato de miles al desenfocar
// y el valor crudo (editable) al enfocar. `value`/`onChange` manejan un string numérico.
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ className, label, error, id, value, onChange, currency = "MXN", disabled, ...props }, ref) => {
    const [focused, setFocused] = useState(false)
    const display = focused ? value : formatMoney(value)
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[var(--color-foreground)]">{label}</label>
        )}
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">$</span>
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode="decimal"
            value={display}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(clean(e.target.value))}
            disabled={disabled}
            className={cn(
              "h-10 w-full rounded-md border border-[var(--color-border)] bg-white",
              "py-2 pl-7 pr-12 text-right text-sm tabular-nums placeholder:text-[var(--color-muted-foreground)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-[var(--color-destructive)]",
              className,
            )}
            {...props}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted-foreground)]">{currency}</span>
        </div>
        {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
      </div>
    )
  },
)
MoneyInput.displayName = "MoneyInput"
