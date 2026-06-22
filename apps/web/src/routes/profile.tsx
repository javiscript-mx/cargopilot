import { createFileRoute } from "@tanstack/react-router"
import { useState, useEffect } from "react"
import { UserCircle, Save, KeyRound } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/toast"
import { authClient, useSession } from "@/lib/auth-client"
import { ROLE_LABELS, type Role } from "@hm/shared"
import { collectErrors, validateRequired } from "@/lib/validators"

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
})

function ProfilePage() {
  const { data: session } = useSession()
  const toast = useToast()
  const user = session?.user

  // ── Datos del perfil (nombre) ──
  const [name, setName] = useState("")
  useEffect(() => { if (user?.name) setName(user.name) }, [user?.name])
  const [savingName, setSavingName] = useState(false)
  const [nameErr, setNameErr] = useState<string>()

  async function saveName(e: React.FormEvent) {
    e.preventDefault()
    const err = validateRequired(name, "Nombre")
    if (err) { setNameErr(err); return }
    setNameErr(undefined); setSavingName(true)
    const { error } = await authClient.updateUser({ name: name.trim() })
    setSavingName(false)
    if (error) toast.error("No se pudo actualizar el perfil", error.message)
    else toast.success("Perfil actualizado")
  }

  // ── Cambio de contraseña ──
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [savingPw, setSavingPw] = useState(false)
  const setPwField = (k: keyof typeof pw) => (e: React.ChangeEvent<HTMLInputElement>) => setPw((p) => ({ ...p, [k]: e.target.value }))

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      current: validateRequired(pw.current, "Contraseña actual"),
      next: pw.next.length < 8 ? "La nueva contraseña debe tener al menos 8 caracteres" : undefined,
      confirm: pw.next !== pw.confirm ? "Las contraseñas no coinciden" : undefined,
    })
    if (Object.keys(errs).length) { setPwErrors(errs); return }
    setPwErrors({}); setSavingPw(true)
    const { error } = await authClient.changePassword({
      currentPassword: pw.current,
      newPassword: pw.next,
      revokeOtherSessions: true, // cierra sesión en otros dispositivos al cambiar la contraseña
    })
    setSavingPw(false)
    if (error) {
      toast.error("No se pudo cambiar la contraseña", error.message?.includes("password") || error.status === 400 ? "Verifica que tu contraseña actual sea correcta." : error.message)
      return
    }
    setPw({ current: "", next: "", confirm: "" })
    toast.success("Contraseña actualizada", "Se cerró la sesión en otros dispositivos.")
  }

  return (
    <AppLayout>
      <div className="mb-6 flex items-center gap-3">
        <UserCircle className="h-6 w-6 text-[var(--color-muted-foreground)]" />
        <h1 className="text-2xl font-bold">Mi perfil</h1>
      </div>

      <div className="flex max-w-2xl flex-col gap-6">
        {/* Datos */}
        <Card>
          <CardHeader><CardTitle>Datos de la cuenta</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveName} className="flex flex-col gap-4">
              <Input id="name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--color-foreground)]">Correo</label>
                  <p className="flex h-10 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-muted)] px-3 text-sm text-[var(--color-muted-foreground)]">{user?.email}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[var(--color-foreground)]">Rol</label>
                  <div className="flex h-10 items-center">
                    <Badge variant="outline">{ROLE_LABELS[(user as { role?: Role } | undefined)?.role as Role] ?? (user as { role?: string } | undefined)?.role ?? "—"}</Badge>
                  </div>
                </div>
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">El correo y el rol solo los puede cambiar un administrador.</p>
              <Button type="submit" size="sm" loading={savingName} className="self-start">
                <Save className="h-3.5 w-3.5" /> Guardar cambios
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Contraseña */}
        <Card>
          <CardHeader><CardTitle>Cambiar contraseña</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="flex flex-col gap-4">
              <Input id="current" type="password" label="Contraseña actual" value={pw.current} onChange={setPwField("current")} error={pwErrors.current} autoComplete="current-password" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input id="next" type="password" label="Nueva contraseña" value={pw.next} onChange={setPwField("next")} error={pwErrors.next} autoComplete="new-password" />
                <Input id="confirm" type="password" label="Confirmar nueva contraseña" value={pw.confirm} onChange={setPwField("confirm")} error={pwErrors.confirm} autoComplete="new-password" />
              </div>
              <p className="text-xs text-[var(--color-muted-foreground)]">Mínimo 8 caracteres. Al cambiarla se cerrará la sesión en otros dispositivos.</p>
              <Button type="submit" size="sm" loading={savingPw} className="self-start">
                <KeyRound className="h-3.5 w-3.5" /> Cambiar contraseña
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
