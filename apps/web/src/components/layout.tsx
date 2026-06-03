import { Link, useNavigate } from "@tanstack/react-router"
import { LayoutDashboard, Users, Building2, Package, FileText, LogOut } from "lucide-react"
import { useSession, signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/shipments", label: "Expedientes", icon: Package },
  { to: "/customers", label: "Clientes", icon: Building2 },
  { to: "/invoices", label: "Facturas", icon: FileText },
  { to: "/users", label: "Usuarios", icon: Users, adminOnly: true },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const navigate = useNavigate()
  const role = (session?.user as { role?: string })?.role

  async function handleSignOut() {
    await signOut()
    await navigate({ to: "/login" })
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-[--color-border] bg-[--color-card]">
        <div className="flex h-14 items-center border-b border-[--color-border] px-4">
          <span className="text-lg font-bold text-[--color-primary]">HM Sistema</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
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
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
        </nav>
        <div className="border-t border-[--color-border] p-3">
          <div className="mb-2 px-3 py-1">
            <p className="text-sm font-medium">{session?.user.name}</p>
            <p className="text-xs text-[--color-muted-foreground]">{session?.user.email}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-3" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-[--color-background]">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  )
}
