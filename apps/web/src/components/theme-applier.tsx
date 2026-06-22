import { useEffect } from "react"
import { useSettings } from "@/hooks/use-settings"

// Aplica los colores configurables (Configuración → Apariencia) como variables CSS en :root.
// Las utilidades usan var(--color-primary)/var(--color-accent), así que el override se ve en todo.
export function ThemeApplier() {
  const { settings } = useSettings()
  const primary = settings["appearance.primaryColor"] as string | undefined
  const accent = settings["appearance.accentColor"] as string | undefined
  const menu = settings["appearance.menuColor"] as string | undefined

  useEffect(() => {
    const root = document.documentElement
    if (primary) root.style.setProperty("--color-primary", primary)
    if (accent) root.style.setProperty("--color-accent", accent)
    if (menu) root.style.setProperty("--color-sidebar", menu)
  }, [primary, accent, menu])

  return null
}
