import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { CheckCircle2, AlertTriangle, ArrowRight, Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Drawer } from "@/components/ui/drawer"
import { shipmentsApi, type ShipmentReadiness } from "@/api/shipments"

// Mapea la siguiente acción a la pestaña donde se resuelve (lleva de la mano)
function tabForNextAction(label: string): string | null {
  const l = label.toLowerCase()
  if (l.includes("cliente")) return null // se edita en el cliente, no en una pestaña
  if (l.includes("tramo") || l.includes("ruta")) return "transporte"
  if (l.includes("mercancía") || l.includes("mercancia") || l.includes("carga")) return "carga"
  if (l.includes("cotiz") || l.includes("tarifa") || l.includes("factura")) return "fiscal"
  if (l.includes("transporte") || l.includes("carta porte") || l.includes("asigna")) return "transporte"
  if (l.includes("entrega") || l.includes("pod")) return "evidencias"
  return null
}

// Semáforos compactos: 6 indicadores derivados de los bloques del readiness
function indicators(r: ShipmentReadiness): { label: string; ok: boolean }[] {
  const ok = (key: string) => r.blocks.find((b) => b.key === key)?.ok ?? false
  const cpOk = !r.hasForaneo || ok("carta_porte")
  return [
    { label: "Cliente", ok: ok("cliente") },
    { label: "Ruta", ok: ok("ruta") },
    { label: "Carga", ok: ok("mercancia") },
    { label: "Transporte", ok: ok("transporte") },
    { label: "Fiscal", ok: ok("cotizacion") && ok("facturacion") && cpOk },
    { label: "POD", ok: ok("cierre") },
  ]
}

// Barra de control: "Siguiente acción" + botón primario contextual + semáforos + drawer de faltantes.
export function ReadinessBar({ shipmentId, customerId, onGoTo }: { shipmentId: string; customerId?: string; onGoTo: (tab: string) => void }) {
  const [open, setOpen] = useState(false)
  const { data } = useQuery({ queryKey: ["readiness", shipmentId], queryFn: () => shipmentsApi.readiness(shipmentId) })
  if (!data) return null

  const blocks = data.blocks.filter((b) => b.applies)
  const ready = blocks.every((b) => b.ok)
  const failing = blocks.filter((b) => !b.ok)
  const missingCount = failing.reduce((acc, b) => acc + b.checks.filter((c) => !c.ok).length, 0)
  const chips = indicators(data)
  const targetTab = data.nextAction ? tabForNextAction(data.nextAction.label) : null
  // La acción de "cliente" no es una pestaña: lleva a editar el cliente con los campos faltantes marcados
  const goToCustomer = !ready && customerId && data.nextAction?.label.toLowerCase().includes("cliente")
  const clienteBlock = data.blocks.find((b) => b.key === "cliente")
  const missingCustomerFields = (clienteBlock?.checks ?? []).filter((c) => !c.ok).flatMap((c) => {
    const l = c.label.toLowerCase()
    if (l.includes("fiscales")) return ["fiscalRegime", "fiscalZipCode"]
    if (l.includes("social")) return ["legalName"]
    if (l.includes("contacto")) return ["contacts"]
    return []
  })

  return (
    <div className={`rounded-lg border p-3 ${ready ? "border-green-300 bg-green-50/40" : "border-amber-300 bg-amber-50/40"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {ready
            ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />}
          <div className="min-w-0">
            {ready ? (
              <p className="text-sm font-semibold text-green-700">Expediente completo — listo para cerrar</p>
            ) : (
              <p className="truncate text-sm">
                <span className="text-[--color-muted-foreground]">Siguiente: </span>
                <span className="font-semibold">{data.nextAction?.label ?? "—"}</span>
              </p>
            )}
            {!ready && data.nextAction && <p className="truncate text-xs text-[--color-muted-foreground]">{data.nextAction.hint}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {goToCustomer ? (
            <Link to="/customers/$id/edit" params={{ id: customerId! }} search={{ missing: missingCustomerFields.join(",") }}>
              <Button size="sm" className="flex items-center gap-1">Ir a completar el cliente <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          ) : (!ready && targetTab && (
            <Button size="sm" onClick={() => onGoTo(targetTab)} className="flex items-center gap-1">
              Ir <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ))}
          {!ready && (
            <button onClick={() => setOpen(true)} className="text-xs font-medium text-[--color-primary] hover:underline">
              Ver {missingCount} faltante{missingCount === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>

      {/* Semáforos compactos */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.ok ? "bg-green-100 text-green-800" : "bg-[--color-muted] text-[--color-muted-foreground]"}`}>
            {c.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {c.label}
          </span>
        ))}
      </div>

      {/* Drawer con el detalle completo de faltantes */}
      <Drawer open={open} onClose={() => setOpen(false)} title="Qué falta para avanzar"
        description="Datos pendientes por bloque para poder avanzar la operación."
        footer={<div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>Cerrar</Button></div>}>
        <div className="flex flex-col gap-4">
          {data.nextAction && (
            <div className="rounded-md border border-amber-300 bg-amber-50/50 p-3">
              <p className="text-xs font-medium text-[--color-muted-foreground]">Siguiente acción</p>
              <p className="mt-0.5 text-sm font-semibold">{data.nextAction.label}</p>
              <p className="text-xs text-[--color-muted-foreground]">{data.nextAction.hint}</p>
            </div>
          )}
          {failing.map((b) => (
            <div key={b.key}>
              <p className="text-xs font-semibold uppercase tracking-wide text-[--color-muted-foreground]">{b.title}</p>
              <div className="mt-0.5 flex flex-col gap-0.5">
                {b.checks.filter((c) => !c.ok).map((c) => (
                  <span key={c.label} className="flex items-center gap-1.5 text-sm text-[--color-destructive]">
                    <X className="h-3.5 w-3.5 shrink-0" /> {c.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {failing.length === 0 && <Badge variant="success">Sin faltantes</Badge>}
        </div>
      </Drawer>
    </div>
  )
}
