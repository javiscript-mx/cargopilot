import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "@/lib/utils"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
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
          className={cn(
            "h-10 w-full rounded-md border border-[var(--color-border)] bg-white",
            "px-3 py-2 text-sm placeholder:text-[var(--color-muted-foreground)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-[var(--color-destructive)] bg-red-50/40 ring-1 ring-[var(--color-destructive)]/40",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
      </div>
    )
  },
)
Input.displayName = "Input"
