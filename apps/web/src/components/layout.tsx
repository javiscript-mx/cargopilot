import { useState, useEffect } from "react"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import { LayoutDashboard, Users, Building2, Package, FileText, LogOut, Menu, X, ChevronLeft } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/shipments", label: "Expedientes", icon: Package },
  { to: "/customers", label: "Clientes", icon: Building2 },
  { to: "/invoices", label: "Facturas", icon: FileText },
  { to: "/users", label: "Usuarios", icon: Users, adminOnly: true },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const role = (session?.user as { role?: string })?.role

  // Desktop: collapsed (solo iconos) / expanded
  const [collapsed, setCollapsed] = useState(false)
  // Mobile: drawer abierto / cerrado
  const [mobileOpen, setMobileOpen] = useState(false)

  // Cierra el drawer al navegar en mobile
  const { location } = useRouterState()
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Cierra el drawer al redimensionar a desktop
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
      <div className="flex h-14 items-center justify-between border-b border-[--color-border] px-3">
        {(!collapsed || isMobile) && (
          <span className="text-lg font-bold text-[--color-primary] truncate">HM Sistema</span>
        )}
        {isMobile ? (
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded p-1.5 hover:bg-[--color-muted]">
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={cn("rounded p-1.5 hover:bg-[--color-muted] text-[--color-muted-foreground] transition-colors", collapsed && "mx-auto")}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems
          .filter((item) => !item.adminOnly || role === "admin")
          .map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                "text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground]",
                "transition-colors [&.active]:bg-[--color-muted] [&.active]:text-[--color-foreground]",
                collapsed && !isMobile && "justify-center px-2",
              )}
              title={collapsed && !isMobile ? item.label : undefined}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Link>
          ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[--color-border] p-2">
        {(!collapsed || isMobile) && (
          <div className="mb-1 px-3 py-1">
            <p className="text-sm font-medium truncate">{session?.user.name}</p>
            <p className="text-xs text-[--color-muted-foreground] truncate">{session?.user.email}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            "text-[--color-muted-foreground] hover:bg-[--color-muted] hover:text-[--color-foreground] transition-colors",
            collapsed && !isMobile && "justify-center px-2",
          )}
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
          "hidden md:flex flex-col border-r border-gray-200 bg-white",
          "transition-all duration-200 shrink-0",
          collapsed ? "w-14" : "w-60",
        )}
      >
        {sidebarContent(false)}
      </aside>

      {/* ── Mobile drawer overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col",
          "border-r border-gray-200 bg-white shadow-xl",
          "transition-transform duration-250 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {sidebarContent(true)}
      </aside>

      {/* ── Main ── */}
      <main className="flex min-h-screen flex-1 flex-col overflow-auto bg-[--color-background]">
        {/* Topbar mobile */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded p-1.5 hover:bg-[--color-muted] text-[--color-muted-foreground]"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-base font-bold text-[--color-primary]">HM Sistema</span>
        </header>

        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}
