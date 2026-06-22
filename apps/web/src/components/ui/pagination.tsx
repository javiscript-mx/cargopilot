import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export const PAGE_SIZE = 10
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

interface PaginationBarProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}

export function PaginationBar({ page, pageSize, total, onPageChange, onPageSizeChange }: PaginationBarProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="whitespace-nowrap text-[var(--color-muted-foreground)]">
          {from}–{to} de {total}
        </span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 whitespace-nowrap text-[var(--color-muted-foreground)]">
            Mostrar
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-[var(--color-border)] bg-white py-1 pl-2 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            por página
          </label>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Anterior
        </Button>
        <span className="whitespace-nowrap text-[var(--color-muted-foreground)]">
          Página {page} de {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </div>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder }: SearchInputProps) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Buscar..."}
        className="w-full rounded-md border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      />
    </div>
  )
}
