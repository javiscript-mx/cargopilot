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
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-[--color-border]", className)}>
      {tabs.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-[--color-primary] text-[--color-primary]"
                : "border-transparent text-[--color-muted-foreground] hover:text-[--color-foreground]",
            )}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs tabular-nums",
                  isActive
                    ? "bg-[--color-primary]/10 text-[--color-primary]"
                    : "bg-[--color-muted] text-[--color-muted-foreground]",
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
