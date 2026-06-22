import { forwardRef, type SelectHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options?: { value: string; label: string }[]
  // Opciones agrupadas (optgroups) — alternativa a `options` para guiar la selección
  groups?: { label: string; options: { value: string; label: string }[] }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options = [], groups, placeholder, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[var(--color-foreground)]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            "h-10 w-full rounded-md border border-[var(--color-border)] bg-white",
            "px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-[var(--color-destructive)] bg-red-50/40 ring-1 ring-[var(--color-destructive)]/40",
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {groups
            ? groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </optgroup>
              ))
            : options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
        </select>
        {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
      </div>
    )
  },
)
Select.displayName = "Select"
