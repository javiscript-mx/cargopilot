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
          <label htmlFor={id} className="text-sm font-medium text-[--color-foreground]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-10 w-full rounded-md border border-[--color-border] bg-[--color-background]",
            "px-3 py-2 text-sm placeholder:text-[--color-muted-foreground]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-primary]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-[--color-destructive]",
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-[--color-destructive]">{error}</p>}
      </div>
    )
  },
)
Input.displayName = "Input"
