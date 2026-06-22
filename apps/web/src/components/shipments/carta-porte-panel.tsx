import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Check, X, FileCheck, Download, FileCode } from "lucide-react"
import { Drawer } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useCan } from "@/lib/permissions"
import { processApi, type LegVehicleAssignment } from "@/api/process"
import { CartaPortePreviewView } from "@/components/shipments/carta-porte-preview"
import { invoicesApi } from "@/api/invoices"
import { quotesApi } from "@/api/quotes"

const TIPO_OPTIONS = [
  { value: "ingreso", label: "Ingreso + Carta Porte (factura el flete)" },
  { value: "traslado", label: "Traslado + Carta Porte (carga propia)" },
]

// Carta Porte de una unidad (1 unidad = 1 CFDI con complemento). Guía la captura
// mostrando exactamente qué falta antes de timbrar, para no rebotar contra el SAT.
export function CartaPortePanel({
  open, onClose, shipmentId, unit, index,
}: { open: boolean; onClose: () => void; shipmentId: string; unit: LegVehicleAssignment; index: number }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { can } = useCan()
  const canStamp = can("invoices.stamp")

  const { data, isLoading } = useQuery({
    queryKey: ["carta-porte", unit.id],
    queryFn: () => processApi.cartaPorte(unit.id),
  })

  // Sugerencia de flete tomada de la cotización (flete ÷ unidades foráneas) — editable
  const { data: quote } = useQuery({ queryKey: ["quote", shipmentId], queryFn: () => quotesApi.get(shipmentId) })
  const { data: process } = useQuery({ queryKey: ["process", shipmentId], queryFn: () => processApi.get(shipmentId) })
  const foraneoUnits = (process?.legs ?? []).filter((l) => l.scope === "foraneo").flatMap((l) => l.vehicles).length || 1
  const quoteItems = quote?.items ?? []
  const fleteFromQuote = quoteItems.filter((i) => (i.productKey || "").startsWith("7810")).reduce((a, i) => a + Number(i.amount), 0)
  const baseFreight = fleteFromQuote || quoteItems.reduce((a, i) => a + Number(i.amount), 0)
  const suggestedFreight = baseFreight > 0 ? (baseFreight / foraneoUnits) : 0
  const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: quote?.currency ?? "MXN" })

  const [view, setView] = useState<"checklist" | "preview">("checklist")
  const [tipo, setTipo] = useState<"ingreso" | "traslado">("ingreso")
  const [freight, setFreight] = useState("")
  const [freightTouched, setFreightTouched] = useState(false)
  const [tipoTouched, setTipoTouched] = useState(false)
  const effectiveTipo = tipoTouched ? tipo : (data?.defaultTipo ?? "ingreso")
  // Valor efectivo: lo que el usuario escribió, o la sugerencia de la cotización
  const effFreight = freightTouched ? freight : (suggestedFreight > 0 ? suggestedFreight.toFixed(2) : "")

  const stamp = useMutation({
    mutationFn: () => processApi.stampCartaPorte(unit.id, {
      tipo: effectiveTipo,
      ...(effectiveTipo === "ingreso" && effFreight ? { freightAmount: Number(effFreight) } : {}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carta-porte", unit.id] })
      queryClient.invalidateQueries({ queryKey: ["process", shipmentId] })
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      queryClient.invalidateQueries({ queryKey: ["readiness", shipmentId] })
      toast.success("Carta Porte timbrada")
    },
    onError: (err: Error) => toast.error("No se pudo timbrar la Carta Porte", err.message),
  })

  const who = [unit.carrierName, unit.vehicleLabel, unit.operatorName].filter(Boolean).join(" · ") || "Unidad sin datos"

  return (
    <Drawer
      open={open} onClose={onClose}
      title={`Carta Porte · Unidad ${index}`}
      description={who}
      className="max-w-lg"
      footer={
        data?.invoice ? (
          <div className="flex justify-end"><Button type="button" size="sm" variant="outline" onClick={onClose}>Cerrar</Button></div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="button" size="sm" loading={stamp.isPending} disabled={!canStamp || !data?.ready} onClick={() => stamp.mutate()}>
              <FileCheck className="h-3.5 w-3.5" /> Timbrar Carta Porte
            </Button>
          </div>
        )
      }
    >
      {isLoading || !data ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">Cargando...</p>
      ) : data.invoice ? (
        // Ya timbrada
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800">
            <FileCheck className="h-5 w-5 shrink-0 text-green-600" />
            Carta Porte timbrada: <span className="font-mono font-semibold">{data.invoice.series}-{data.invoice.folio}</span>
          </div>
          <div className="flex gap-2">
            <a href={invoicesApi.pdfUrl(data.invoice.id)} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="outline" className="flex items-center gap-1"><Download className="h-3.5 w-3.5" /> PDF</Button>
            </a>
            <a href={invoicesApi.xmlUrl(data.invoice.id)} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="outline" className="flex items-center gap-1"><FileCode className="h-3.5 w-3.5" /> XML</Button>
            </a>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Toggle: checklist de completitud ↔ previsualización del complemento */}
          <div className="flex gap-1 rounded-lg bg-[var(--color-muted)] p-1">
            <button type="button" onClick={() => setView("checklist")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${view === "checklist" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted-foreground)]"}`}>Checklist</button>
            <button type="button" onClick={() => setView("preview")}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${view === "preview" ? "bg-white text-[var(--color-primary)] shadow-sm" : "text-[var(--color-muted-foreground)]"}`}>Previsualización</button>
          </div>

          {view === "preview" && <CartaPortePreviewView p={data.preview} />}

          {/* Checklist de completitud */}
          {view === "checklist" && (
          <div className="flex flex-col gap-3">
            {data.groups.map((g) => (
              <div key={g.group}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{g.group}</p>
                <div className="flex flex-col gap-1">
                  {g.items.map((it) => (
                    <div key={it.label} className="flex items-center gap-2 text-sm">
                      {it.ok
                        ? <Check className="h-4 w-4 shrink-0 text-green-600" />
                        : <X className="h-4 w-4 shrink-0 text-[var(--color-destructive)]" />}
                      <span className={it.ok ? "" : "text-[var(--color-destructive)]"}>{it.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          )}

          {data.ready ? (
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-4">
              <Select id="cp-tipo" label="Tipo de CFDI" options={TIPO_OPTIONS} value={effectiveTipo}
                onChange={(e) => { setTipo(e.target.value as "ingreso" | "traslado"); setTipoTouched(true) }} disabled={!canStamp} />
              {effectiveTipo === "ingreso" && (
                <div className="flex flex-col gap-1">
                  <Input id="cp-freight" label="Monto del flete (MXN, sin IVA)" type="number" min="0" step="0.01"
                    value={effFreight} onChange={(e) => { setFreightTouched(true); setFreight(e.target.value) }} placeholder="Se factura en este CFDI" disabled={!canStamp} />
                  {suggestedFreight > 0 && !freightTouched && (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Sugerido desde la cotización: {money(baseFreight)}{foraneoUnits > 1 ? ` ÷ ${foraneoUnits} unidades` : ""}. Ajústalo si aplica.
                    </p>
                  )}
                </div>
              )}
              {!canStamp && <p className="text-xs text-[var(--color-muted-foreground)]">No tienes permiso para timbrar.</p>}
            </div>
          ) : (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/40 p-3 text-sm text-[var(--color-muted-foreground)]">
              Completa lo marcado en rojo (en la unidad, el tramo o la mercancía) para habilitar el timbrado.
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}
