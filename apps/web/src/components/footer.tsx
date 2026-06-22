// Footer global, simple. El soporte técnico por ticket queda como nota a futuro (aún no existe).
export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-[var(--color-border)] px-4 py-4 text-center text-xs text-[var(--color-muted-foreground)]">
      <p>
        © {year} · Desarrollado por <span className="font-semibold text-[var(--color-foreground)]">naviofy</span>
      </p>
      <p className="mt-0.5">Soporte técnico por ticket próximamente desde el portal.</p>
    </footer>
  )
}
