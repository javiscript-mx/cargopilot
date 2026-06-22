import { createFileRoute, redirect } from "@tanstack/react-router"
import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Users, Plus, Pencil, KeyRound, ShieldCheck, Check } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Drawer } from "@/components/ui/drawer"
import { Tabs, type TabItem } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { usersApi } from "@/api/users"
import { useCan } from "@/lib/permissions"
import { authClient, useSession } from "@/lib/auth-client"
import {
  ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, PERMISSIONS, PERMISSION_META,
  roleHasPermission, type Role, type Permission,
} from "@hm/shared"
import type { UserResponse } from "@hm/shared"
import { validateEmail, validateRequired, collectErrors } from "@/lib/validators"

export const Route = createFileRoute("/users")({
  beforeLoad: async () => {
    const session = await authClient.getSession()
    const role = (session.data?.user as { role?: string })?.role ?? ""
    if (!roleHasPermission(role, "users.read")) throw redirect({ to: "/" })
  },
  component: UsersPage,
})

type BadgeVariant = "default" | "success" | "warning" | "destructive" | "outline"
const ROLE_BADGE: Record<Role, BadgeVariant> = {
  admin: "default", operator: "success", finance: "warning", viewer: "outline",
}
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))

function UsersPage() {
  const queryClient = useQueryClient()
  const { can } = useCan()
  const { data: session } = useSession()
  const selfId = session?.user?.id
  const canManage = can("users.manage")

  const [tab, setTab] = useState("usuarios")
  const [createOpen, setCreateOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserResponse | null>(null)
  const [resetUser, setResetUser] = useState<UserResponse | null>(null)

  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: usersApi.list })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] })

  const tabs: TabItem[] = [
    { id: "usuarios", label: "Usuarios", count: users.length, icon: <Users className="h-4 w-4" /> },
    { id: "roles", label: "Roles y privilegios", icon: <ShieldCheck className="h-4 w-4" /> },
  ]

  return (
    <AppLayout>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="text-[var(--color-muted-foreground)]">{users.length} usuarios · {ROLES.length} roles</p>
        </div>
        {canManage && tab === "usuarios" && (
          <Button className="flex items-center gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo usuario
          </Button>
        )}
      </div>

      <Card>
        <Tabs tabs={tabs} active={tab} onChange={setTab} className="px-2 pt-1" />
        <CardContent className="p-0">
          {tab === "usuarios" ? (
            isLoading ? (
              <div className="flex items-center justify-center py-12 text-[var(--color-muted-foreground)]">Cargando...</div>
            ) : (
              <UsersTable
                users={users} selfId={selfId} canManage={canManage}
                onEdit={setEditUser} onReset={setResetUser}
              />
            )
          ) : (
            <RolesMatrix />
          )}
        </CardContent>
      </Card>

      {canManage && (
        <>
          <CreateUserDrawer open={createOpen} onClose={() => setCreateOpen(false)} onDone={invalidate} />
          <EditUserDrawer
            user={editUser} isSelf={editUser?.id === selfId}
            onClose={() => setEditUser(null)} onDone={invalidate}
            onResetPassword={(u) => { setEditUser(null); setResetUser(u) }}
          />
          <ResetPasswordDrawer user={resetUser} onClose={() => setResetUser(null)} />
        </>
      )}
    </AppLayout>
  )
}

// ── Tabla de usuarios ─────────────────────────────────────────────────────────
function UsersTable({ users, selfId, canManage, onEdit, onReset }: {
  users: UserResponse[]; selfId?: string; canManage: boolean
  onEdit: (u: UserResponse) => void; onReset: (u: UserResponse) => void
}) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--color-muted-foreground)]">
        <Users className="h-12 w-12 opacity-30" />
        <p>No hay usuarios</p>
      </div>
    )
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--color-border)]">
          <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Nombre</th>
          <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Correo</th>
          <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Rol</th>
          <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Estado</th>
          <th className="px-4 py-3 text-left font-medium text-[var(--color-muted-foreground)]">Alta</th>
          {canManage && <th className="px-4 py-3" />}
        </tr>
      </thead>
      <tbody>
        {users.map((u) => {
          const role = (u.role in ROLE_LABELS ? u.role : "viewer") as Role
          return (
            <tr key={u.id} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-muted)]/50">
              <td className="px-4 py-3 font-medium">
                {u.name}
                {u.id === selfId && <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">(tú)</span>}
              </td>
              <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{u.email}</td>
              <td className="px-4 py-3"><Badge variant={ROLE_BADGE[role]}>{ROLE_LABELS[role]}</Badge></td>
              <td className="px-4 py-3">
                {u.active
                  ? <Badge variant="success">Activo</Badge>
                  : <Badge variant="outline">Inactivo</Badge>}
              </td>
              <td className="px-4 py-3 text-[var(--color-muted-foreground)]">{new Date(u.createdAt).toLocaleDateString("es-MX")}</td>
              {canManage && (
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => onEdit(u)}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="flex items-center gap-1" onClick={() => onReset(u)} title="Restablecer contraseña">
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Matriz de roles y privilegios (referencia) ────────────────────────────────
function RolesMatrix() {
  // Agrupa los privilegios por módulo conservando el orden de PERMISSIONS
  const groups: { module: string; perms: Permission[] }[] = []
  for (const p of PERMISSIONS) {
    const mod = PERMISSION_META[p].module
    const last = groups[groups.length - 1]
    if (last && last.module === mod) last.perms.push(p)
    else groups.push({ module: mod, perms: [p] })
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-md border border-[var(--color-border)] p-3">
            <Badge variant={ROLE_BADGE[r]}>{ROLE_LABELS[r]}</Badge>
            <p className="mt-1.5 text-xs text-[var(--color-muted-foreground)]">{ROLE_DESCRIPTIONS[r]}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="px-3 py-2 text-left font-medium text-[var(--color-muted-foreground)]">Privilegio</th>
              {ROLES.map((r) => (
                <th key={r} className="px-3 py-2 text-center font-medium text-[var(--color-muted-foreground)]">{ROLE_LABELS[r]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <PermissionGroup key={g.module} module={g.module} perms={g.perms} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PermissionGroup({ module, perms }: { module: string; perms: Permission[] }) {
  return (
    <>
      <tr className="bg-[var(--color-muted)]/40">
        <td colSpan={ROLES.length + 1} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{module}</td>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-b border-[var(--color-border)] last:border-0">
          <td className="px-3 py-2">
            <span className="font-medium">{PERMISSION_META[p].label}</span>
            <span className="block text-xs text-[var(--color-muted-foreground)]">{PERMISSION_META[p].description}</span>
          </td>
          {ROLES.map((r) => (
            <td key={r} className="px-3 py-2 text-center">
              {roleHasPermission(r, p)
                ? <Check className="mx-auto h-4 w-4 text-green-600" />
                : <span className="text-[var(--color-muted-foreground)]">—</span>}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ── Drawer: crear usuario ─────────────────────────────────────────────────────
function CreateUserDrawer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" as Role })
  const [errors, setErrors] = useState<Record<string, string>>({})

  function reset() { setForm({ name: "", email: "", password: "", role: "operator" }); setErrors({}) }

  const mutation = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: (u) => { onDone(); toast.success("Usuario creado", u.email); reset(); onClose() },
    onError: (err: Error) => toast.error("No se pudo crear el usuario", err.message),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = collectErrors({
      name: validateRequired(form.name, "Nombre"),
      email: form.email ? validateEmail(form.email) : "El correo es obligatorio",
      password: form.password.length < 8 ? "Mínimo 8 caracteres" : undefined,
    })
    if (Object.keys(errs).length) {
      setErrors(errs)
      toast.error("Revisa los campos marcados", "Hay datos por corregir antes de guardar.")
      return
    }
    setErrors({})
    mutation.mutate()
  }

  return (
    <Drawer
      open={open} onClose={() => { reset(); onClose() }} title="Nuevo usuario"
      description="Crea una cuenta y asígnale un rol"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button type="submit" form="create-user-form" loading={mutation.isPending}>Crear usuario</Button>
        </div>
      }
    >
      <form id="create-user-form" onSubmit={submit} className="flex flex-col gap-4">
        <Input id="name" label="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors["name"]} />
        <Input id="email" label="Correo" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors["email"]} />
        <Input id="password" label="Contraseña temporal" type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} error={errors["password"]} placeholder="Mínimo 8 caracteres" />
        <div>
          <Select id="role" label="Rol" options={ROLE_OPTIONS} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{ROLE_DESCRIPTIONS[form.role]}</p>
        </div>
      </form>
    </Drawer>
  )
}

// ── Drawer: editar usuario ────────────────────────────────────────────────────
function EditUserDrawer({ user, isSelf, onClose, onDone, onResetPassword }: {
  user: UserResponse | null; isSelf: boolean
  onClose: () => void; onDone: () => void; onResetPassword: (u: UserResponse) => void
}) {
  const toast = useToast()
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>("operator")
  const [active, setActive] = useState(true)

  // Sincroniza el estado del form cuando cambia el usuario objetivo
  const [lastId, setLastId] = useState<string | null>(null)
  if (user && user.id !== lastId) {
    setLastId(user.id)
    setName(user.name)
    setRole((user.role in ROLE_LABELS ? user.role : "viewer") as Role)
    setActive(user.active)
  }

  const mutation = useMutation({
    mutationFn: () => usersApi.update(user!.id, { name, role, active }),
    onSuccess: (u) => { onDone(); toast.success("Cambios guardados", u.name); onClose() },
    onError: (err: Error) => toast.error("No se pudieron guardar los cambios", err.message),
  })

  if (!user) return null

  return (
    <Drawer
      open={!!user} onClose={onClose} title="Editar usuario" description={user.email}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="edit-user-form" loading={mutation.isPending}>Guardar cambios</Button>
        </div>
      }
    >
      <form id="edit-user-form" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="flex flex-col gap-4">
        <Input id="edit-name" label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <Select id="edit-role" label="Rol" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={isSelf} />
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {isSelf ? "No puedes cambiar tu propio rol." : ROLE_DESCRIPTIONS[role]}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} disabled={isSelf} onChange={(e) => setActive(e.target.checked)} />
          Cuenta activa
          {isSelf && <span className="text-xs text-[var(--color-muted-foreground)]">(no puedes desactivarte)</span>}
        </label>
        <div className="border-t border-[var(--color-border)] pt-4">
          <Button type="button" variant="outline" className="flex items-center gap-1.5" onClick={() => onResetPassword(user)}>
            <KeyRound className="h-3.5 w-3.5" /> Restablecer contraseña
          </Button>
        </div>
      </form>
    </Drawer>
  )
}

// ── Drawer: restablecer contraseña ────────────────────────────────────────────
function ResetPasswordDrawer({ user, onClose }: { user: UserResponse | null; onClose: () => void }) {
  const toast = useToast()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const mutation = useMutation({
    mutationFn: () => usersApi.resetPassword(user!.id, password),
    onSuccess: () => { toast.success("Contraseña restablecida", "Se cerraron las sesiones del usuario."); setPassword(""); onClose() },
    onError: (err: Error) => toast.error("No se pudo restablecer la contraseña", err.message),
  })

  if (!user) return null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError("Mínimo 8 caracteres"); return }
    setError("")
    mutation.mutate()
  }

  return (
    <Drawer
      open={!!user} onClose={() => { setPassword(""); setError(""); onClose() }}
      title="Restablecer contraseña" description={user.email}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => { setPassword(""); setError(""); onClose() }}>Cancelar</Button>
          <Button type="submit" form="reset-pw-form" loading={mutation.isPending}>Restablecer</Button>
        </div>
      }
    >
      <form id="reset-pw-form" onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Define una contraseña temporal. Al guardar se cerrarán las sesiones activas del usuario y deberá entrar con la nueva contraseña.
        </p>
        <Input id="new-password" label="Nueva contraseña" type="text" value={password} onChange={(e) => setPassword(e.target.value)} error={error} placeholder="Mínimo 8 caracteres" />
      </form>
    </Drawer>
  )
}
