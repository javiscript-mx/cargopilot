import { useState, useEffect } from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { LayoutDashboard, Users, Building2, Package, FileText, Settings, Truck, BookOpen, LogOut, Menu, X, ChevronLeft } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { useCan } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { Logo } from "@/components/ui/logo"
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

const navItems: { to: string; label: string; icon: typeof LayoutDashboard; perm?: Permission }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/shipments", label: "Expedientes", icon: Package },
  { to: "/customers", label: "Clientes", icon: Building2 },
  { to: "/invoices", label: "Facturas", icon: FileText },
  { to: "/suppliers", label: "Proveedores", icon: Truck },
  { to: "/users", label: "Usuarios", icon: Users, perm: "users.read" },
  { to: "/catalog", label: "Catálogos", icon: BookOpen, perm: "catalog.manage" },
  { to: "/settings", label: "Configuración", icon: Settings, perm: "settings.manage" },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const { can } = useCan()

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { location } = useRouterState()

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
            <Logo size={26} className="text-white" bg={S.bg} />
          </button>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Logo size={24} className="shrink-0 text-white" bg={S.bg} />
              <span className="truncate text-lg font-bold" style={{ color: S.logo }}>
                HM Sistema
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
        {navItems
          .filter((item) => !item.perm || can(item.perm))
          .map((item) => {
            const isActive = location.pathname === item.to ||
              (item.to !== "/" && location.pathname.startsWith(item.to))
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
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = S.bgHover
                    e.currentTarget.style.color = S.textHover
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent"
                    e.currentTarget.style.color = S.text
                  }
                }}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {(!collapsed || isMobile) && <span>{item.label}</span>}
              </Link>
            )
          })}
      </nav>

      {/* Footer */}
      <div className="p-2" style={{ borderTop: `1px solid ${S.border}` }}>
        {(!collapsed || isMobile) && (
          <div className="mb-1 px-3 py-1">
            <p className="truncate text-sm font-medium" style={{ color: S.textHover }}>
              {session?.user.name}
            </p>
            <p className="truncate text-xs" style={{ color: S.text }}>
              {session?.user.email}
            </p>
          </div>
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
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 transition-all duration-200",
          collapsed ? "w-14" : "w-60",
        )}
        style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
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
        style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
      >
        {sidebarContent(true)}
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-screen flex-1 flex-col overflow-auto bg-[--color-background]">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[--color-border] bg-white px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-1.5 text-[--color-muted-foreground] hover:bg-[--color-muted]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Logo size={24} tile className="text-white" />
          <span className="text-base font-bold" style={{ color: S.logo }}>HM Sistema</span>
        </header>

        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}
