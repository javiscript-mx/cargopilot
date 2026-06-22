import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface TabItem {
  id: string
  label: string
  count?: number
  icon?: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/**
 * Barra de pestañas controlada. El padre renderiza el panel activo.
 * Muestra un contador opcional por pestaña.
 */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-[var(--color-border)]", className)}>
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm transition-colors",
              isActive
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] font-semibold text-white shadow-sm"
                : "border-transparent font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
            )}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
