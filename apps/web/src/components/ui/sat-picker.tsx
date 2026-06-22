import { useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search, Check, ChevronDown } from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { cn } from "@/lib/utils"

export interface PickerItem { code: string; label: string }

interface SatPickerProps {
  /** clave seleccionada */
  value: string
  onChange: (code: string) => void
  /** búsqueda server-side; devuelve opciones */
  search: (q: string) => Promise<PickerItem[]>
  /** resuelve la etiqueta de una clave ya seleccionada */
  resolve: (code: string) => Promise<PickerItem | null>
  /** clave de cache (p. ej. "prodserv" / "unidades") */
  cacheKey: string
  label?: string
  placeholder?: string
  error?: string
  minChars?: number
}

// Combobox con búsqueda server-side para catálogos SAT grandes.
export function SatPicker({ value, onChange, search, resolve, cacheKey, label, placeholder, error, minChars = 2 }: SatPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debounced = useDebouncedValue(query, 250)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Etiqueta de la clave seleccionada
  const { data: selected } = useQuery({
    queryKey: ["sat", cacheKey, "resolve", value],
    queryFn: () => resolve(value),
    enabled: Boolean(value),
    staleTime: 1000 * 60 * 30,
  })

  // Resultados de búsqueda
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["sat", cacheKey, "search", debounced],
    queryFn: () => search(debounced.trim()),
    enabled: open && debounced.trim().length >= minChars,
    staleTime: 1000 * 60 * 5,
  })

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  function pick(code: string) {
    onChange(code)
    setOpen(false)
    setQuery("")
  }

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      {label && <span className="text-sm font-medium text-[var(--color-foreground)]">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]",
          error ? "border-[var(--color-destructive)]" : "border-[var(--color-border)]",
        )}
      >
        <span className={cn("min-w-0 truncate", !value && "text-[var(--color-muted-foreground)]")}>
          {value ? (selected?.label ?? value) : (placeholder ?? "Selecciona...")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-[var(--color-border)] bg-white shadow-lg">
          <div className="relative border-b border-[var(--color-border)]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por clave o descripción..."
              className="w-full py-2 pl-9 pr-3 text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {debounced.trim().length < minChars ? (
              <p className="px-3 py-3 text-xs text-[var(--color-muted-foreground)]">Escribe al menos {minChars} caracteres…</p>
            ) : isFetching ? (
              <p className="px-3 py-3 text-xs text-[var(--color-muted-foreground)]">Buscando…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-3 text-xs text-[var(--color-muted-foreground)]">Sin resultados.</p>
            ) : (
              results.map((it) => (
                <button
                  key={it.code}
                  type="button"
                  onClick={() => pick(it.code)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", it.code === value ? "opacity-100 text-[var(--color-primary)]" : "opacity-0")} />
                  <span className="min-w-0 truncate">{it.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
    </div>
  )
}
