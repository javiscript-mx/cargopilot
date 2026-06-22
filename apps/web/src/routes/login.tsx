import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Truck, FileCheck, Wallet, AlertCircle } from "lucide-react"
import { signIn } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Logo } from "@/components/ui/logo"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

const FEATURES = [
  { icon: Truck, label: "Expedientes y tramos con Carta Porte" },
  { icon: FileCheck, label: "Timbrado CFDI 4.0 vía Facturama" },
  { icon: Wallet, label: "Compras, gastos y cuentas por pagar" },
]

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const year = new Date().getFullYear()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const result = await signIn.email({ email, password })
      if (result.error) {
        setError("Credenciales incorrectas. Verifica tu correo y contraseña.")
      } else {
        await navigate({ to: "/" })
      }
    } catch {
      setError("No se pudo conectar. Intenta de nuevo en un momento.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Panel de marca (oculto en móvil) ── */}
      <div
        className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-10 text-white lg:flex xl:p-14"
        style={{ background: "linear-gradient(150deg, #16293f 0%, #1e3550 45%, #284a70 100%)" }}
      >
        {/* Marca de agua del fondo: se difumina y se enmascara para que no parezca un PNG ampliado */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-24 -right-16 h-[24rem] w-[24rem] rounded-full bg-white/8 blur-3xl" />
          <div
            className="absolute -bottom-18 -right-16 opacity-[0.08] blur-[1px] saturate-0"
            style={{ maskImage: "radial-gradient(circle at center, black 0%, black 56%, transparent 84%)" }}
          >
            <Logo size={420} bg="transparent" />
          </div>
          <div
            className="absolute -bottom-28 -right-28 opacity-[0.035] blur-xl saturate-0"
            style={{ maskImage: "radial-gradient(circle at center, black 0%, black 52%, transparent 86%)" }}
          >
            <Logo size={540} bg="transparent" />
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <Logo size={40} tile bg="#ffffff1f" className="text-white" />
          <span className="text-xl font-semibold tracking-tight">HM Sistema</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight xl:text-4xl">
            La operación de tu agencia de carga, en un solo lugar.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Expedientes, Carta Porte, facturación electrónica y finanzas — con trazabilidad de punta a punta.
          </p>
          <ul className="mt-8 flex flex-col gap-3.5 text-sm text-white/85">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {year} HM Sistema · Desarrollado por <span className="font-semibold text-white/75">naviofy</span>
        </p>
      </div>

      {/* ── Panel del formulario ── */}
      <div className="flex w-full flex-col items-center justify-center bg-[var(--color-background)] px-6 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          {/* Marca compacta (solo móvil, donde el panel navy no se ve) */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <Logo size={40} tile className="text-white" />
            <span className="text-xl font-bold text-[var(--color-primary)]">HM Sistema</span>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-foreground)]">Inicia sesión</h2>
            <p className="mt-1.5 text-sm text-[var(--color-muted-foreground)]">
              Accede a tu panel de operación.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="email"
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@empresa.mx"
              required
            />
            <Input
              id="password"
              label="Contraseña"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-[var(--color-destructive)]/30 bg-red-50 px-3 py-2.5 text-sm text-[var(--color-destructive)]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <Button type="submit" size="lg" loading={loading} className="mt-1 w-full">
              Entrar
            </Button>
          </form>

          <p className="mt-10 text-center text-xs text-[var(--color-muted-foreground)] lg:hidden">
            © {year} · Desarrollado por <span className="font-semibold text-[var(--color-foreground)]">naviofy</span>
          </p>
        </div>
      </div>
    </div>
  )
}
