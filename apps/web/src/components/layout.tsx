import { useState, useEffect } from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { LayoutDashboard, Users, Building2, Package, FileText, Settings, Truck, BookOpen, LogOut, Menu, X, ChevronLeft, ChevronDown, Landmark, ShoppingCart, UserCircle, ScrollText, HelpCircle } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useCan } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/ui/logo"
import { ThemeApplier } from "@/components/theme-applier"
import { Footer } from "@/components/footer"
import { useSettings } from "@/hooks/use-settings"
import { useModules, type ModuleKey } from "@/hooks/use-modules"
import type { Permission } from "@hm/shared"

// ── Sidebar palette (hardcoded so it works on fixed/sticky elements) ──────────
const S = {
  bg:            "#111d2d",
  bgHover:       "#1a2e45",
  bgActive:      "#1e3550",
  border:        "#1e3550",
  text:          "#8aaec8",
  textHover:     "#d9e0e8",
  textActive:    "#f49c2f",
  logo:          "#f49c2f",
}

type NavLeaf = { to: string; label: string; icon: typeof LayoutDashboard; perm?: Permission; module?: ModuleKey }
type NavGroup = { group: string; label: string; icon: typeof LayoutDashboard; children: NavLeaf[] }
type NavEntry = NavLeaf | NavGroup
const isGroup = (e: NavEntry): e is NavGroup => "children" in e

const navItems: NavEntry[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/shipments", label: "Expedientes", icon: Package, module: "shipments" },
  { to: "/customers", label: "Clientes", icon: Building2, module: "customers" },
  { group: "finanzas", label: "Finanzas", icon: Landmark, children: [
    { to: "/invoices", label: "Facturación", icon: FileText, perm: "invoices.read", module: "invoicing" },
    { to: "/purchases", label: "Compras", icon: ShoppingCart, perm: "purchases.read", module: "purchases" },
  ] },
  { to: "/suppliers", label: "Proveedores", icon: Truck, module: "suppliers" },
  { to: "/users", label: "Usuarios", icon: Users, perm: "users.read" },
  { to: "/audit", label: "Auditoría", icon: ScrollText, perm: "audit.read" },
  { to: "/catalog", label: "Catálogos", icon: BookOpen, perm: "catalog.manage" },
  { to: "/settings", label: "Configuración", icon: Settings, perm: "settings.manage" },
  { to: "/docs", label: "Documentación", icon: HelpCircle },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const { can } = useCan()
  const { settings } = useSettings()
  const { isEnabled, moduleForPath } = useModules()
  const systemName = (settings["branding.systemName"] as string) || "HM Sistema"
  const logoDataUrl = (settings["branding.logoDataUrl"] as string) || ""

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const { location } = useRouterState()

  const leafActive = (to: string) =>
    location.pathname === to || (to !== "/" && location.pathname.startsWith(to))

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMobileOpen(false) }
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [])

  async function handleSignOut() {
    await signOut()
    await navigate({ to: "/login" })
  }

  // Renderiza un ítem hoja (link) del menú con sus estilos/hover inline
  const renderLeaf = (item: NavLeaf, isMobile: boolean, _indented: boolean) => {
    const isActive = leafActive(item.to)
    return (
      <Link
        key={item.to}
        to={item.to}
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          collapsed && !isMobile && "justify-center px-2",
        )}
        style={{
          color: isActive ? S.textActive : S.text,
          background: isActive ? S.bgActive : "transparent",
          borderLeft: isActive ? `3px solid ${S.textActive}` : "3px solid transparent",
        }}
        title={collapsed && !isMobile ? item.label : undefined}
        onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.color = S.textHover } }}
        onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = S.text } }}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {(!collapsed || isMobile) && <span>{item.label}</span>}
      </Link>
    )
  }

  const sidebarContent = (isMobile = false) => (
    <>
      {/* Header */}
      <div
        className="flex h-14 items-center justify-between px-3"
        style={{ borderBottom: `1px solid ${S.border}` }}
      >
        {collapsed && !isMobile ? (
          // Colapsado: solo la marca, clic para expandir
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto rounded p-1 transition-opacity hover:opacity-80"
            title="Expandir menú"
          >
            {logoDataUrl
              ? <img src={logoDataUrl} alt={systemName} className="h-[26px] w-[26px] rounded object-contain" />
              : <Logo size={26} className="text-white" bg={S.bg} />}
          </button>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              {logoDataUrl
                ? <img src={logoDataUrl} alt={systemName} className="h-6 w-6 shrink-0 rounded object-contain" />
                : <Logo size={24} className="shrink-0 text-white" bg={S.bg} />}
              <span className="truncate text-lg font-bold" style={{ color: S.logo }}>
                {systemName}
              </span>
            </div>
            <button
              onClick={() => (isMobile ? setMobileOpen(false) : setCollapsed(true))}
              className="rounded p-1.5 transition-colors"
              style={{ color: S.text }}
              onMouseEnter={e => (e.currentTarget.style.color = S.textHover)}
              onMouseLeave={e => (e.currentTarget.style.color = S.text)}
            >
              {isMobile ? <X className="h-5 w-5" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {navItems.map((entry) => {
          const allowed = (n: NavLeaf) => (!n.perm || can(n.perm)) && (!n.module || isEnabled(n.module))
          if (!isGroup(entry)) {
            return allowed(entry) ? renderLeaf(entry, isMobile, false) : null
          }
          // Grupo (p. ej. Finanzas): se filtran hijos por permiso + módulo; si no queda ninguno, se omite
          const children = entry.children.filter(allowed)
          if (children.length === 0) return null
          const childActive = children.some((c) => leafActive(c.to))
          const compact = collapsed && !isMobile
          // Colapsado: mostramos los hijos como íconos sueltos (sin cabecera de grupo)
          if (compact) return <div key={entry.group}>{children.map((c) => renderLeaf(c, isMobile, false))}</div>
          const open = openGroups[entry.group] ?? childActive
          return (
            <div key={entry.group}>
              <button
                onClick={() => setOpenGroups((g) => ({ ...g, [entry.group]: !(g[entry.group] ?? childActive) }))}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{ color: childActive ? S.textActive : S.text, background: "transparent" }}
                onMouseEnter={(e) => { if (!childActive) e.currentTarget.style.color = S.textHover }}
                onMouseLeave={(e) => { if (!childActive) e.currentTarget.style.color = S.text }}
              >
                <entry.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{entry.label}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
              </button>
              {open && <div className="ml-3 flex flex-col gap-0.5 border-l pl-1" style={{ borderColor: S.border }}>
                {children.map((c) => renderLeaf(c, isMobile, false))}
              </div>}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-2" style={{ borderTop: `1px solid ${S.border}` }}>
        {(!collapsed || isMobile) ? (
          <Link to="/profile" className="mb-1 block rounded-md px-3 py-1.5 transition-colors"
            style={{ color: S.textHover }}
            onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
            title="Mi perfil">
            <p className="truncate text-sm font-medium" style={{ color: S.textHover }}>
              {session?.user.name}
            </p>
            <p className="truncate text-xs" style={{ color: S.text }}>
              {session?.user.email}
            </p>
          </Link>
        ) : (
          <Link to="/profile" title="Mi perfil"
            className="mb-1 flex justify-center rounded-md p-2 transition-colors"
            style={{ color: S.text }}
            onMouseEnter={(e) => { e.currentTarget.style.background = S.bgHover; e.currentTarget.style.color = S.textHover }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = S.text }}>
            <UserCircle className="h-5 w-5" />
          </Link>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            collapsed && !isMobile && "justify-center px-2",
          )}
          style={{ color: S.text }}
          onMouseEnter={e => {
            e.currentTarget.style.background = S.bgHover
            e.currentTarget.style.color = S.textHover
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "transparent"
            e.currentTarget.style.color = S.text
          }}
          title={collapsed && !isMobile ? "Cerrar sesión" : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {(!collapsed || isMobile) && <span>Cerrar sesión</span>}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen">
      <ThemeApplier />
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-200",
          collapsed ? "w-14" : "w-60",
        )}
        style={{ background: `var(--color-sidebar, ${S.bg})`, borderRight: `1px solid ${S.border}` }}
      >
        {sidebarContent(false)}
      </aside>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col shadow-2xl",
          "transition-transform duration-250 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: `var(--color-sidebar, ${S.bg})`, borderRight: `1px solid ${S.border}` }}
      >
        {sidebarContent(true)}
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-screen flex-1 flex-col overflow-auto bg-[var(--color-background)]">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-white px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <Menu className="h-5 w-5" />
          </button>
          {logoDataUrl
            ? <img src={logoDataUrl} alt={systemName} className="h-6 w-6 rounded object-contain" />
            : <Logo size={24} tile className="text-white" />}
          <span className="text-base font-bold" style={{ color: S.logo }}>{systemName}</span>
        </header>

        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
          {(() => {
            const mod = moduleForPath(location.pathname)
            if (mod && !isEnabled(mod)) {
              return (
                <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
                  <h2 className="text-lg font-semibold">Módulo no disponible</h2>
                  <p className="max-w-sm text-sm text-[var(--color-muted-foreground)]">
                    Este módulo está deshabilitado. Un administrador puede activarlo en Configuración → Módulos.
                  </p>
                </div>
              )
            }
            return children
          })()}
        </div>
        <Footer />
      </main>
    </div>
  )
}
