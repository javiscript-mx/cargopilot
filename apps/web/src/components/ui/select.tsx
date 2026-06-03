import { forwardRef, type SelectHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, placeholder, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-[--color-foreground]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            "h-10 w-full rounded-md border border-[--color-border] bg-[--color-background]",
            "px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-[--color-destructive]",
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
      </div>
    )
  },
)
Select.displayName = "Select"
