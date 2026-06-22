import type { CartaPortePreview } from "@/api/process"

// Previsualización del complemento Carta Porte (cómo quedaría antes de timbrar).
// Reutilizada por el panel de CP por unidad y por la factura con complemento.
export function CartaPortePreviewView({ p }: { p: CartaPortePreview }) {
  const dash = (v: string | number | null | undefined) => (v != null && v !== "" ? String(v) : "—")
  const fdate = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—")
  const loc = (l: CartaPortePreview["origen"]) => (
    <div className="text-sm">
      <p className="font-medium">{dash(l.nombre)} {l.rfc && <span className="font-mono text-xs text-[var(--color-muted-foreground)]">· {l.rfc}</span>}</p>
      <p className="text-xs text-[var(--color-muted-foreground)]">CP {dash(l.cp)} · {dash(l.estado)} · {fdate(l.fecha)}</p>
      {l.domicilio && <p className="text-xs text-[var(--color-muted-foreground)]">{l.domicilio}</p>}
    </div>
  )
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="rounded-md border border-[var(--color-border)] p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</p>
      {children}
    </div>
  )
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-[var(--color-muted-foreground)]">Así se enviará el complemento. Lo que falte aparece como "—".</p>
      <Section title={`Origen → Destino · ${p.distanciaKm != null ? `${p.distanciaKm.toLocaleString("es-MX")} km` : "sin distancia"}`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{loc(p.origen)}{loc(p.destino)}</div>
      </Section>
      <Section title="Autotransporte">
        {p.autotransporte ? (
          <p className="text-sm">{dash(p.autotransporte.placa)} · {dash(p.autotransporte.config)} · {dash(p.autotransporte.anio)} · Perm {dash(p.autotransporte.permSct)} {dash(p.autotransporte.numPermiso)} · Seguro {dash(p.autotransporte.aseguradora)} {dash(p.autotransporte.poliza)}{p.remolques.length ? ` · Remolques: ${p.remolques.join(", ")}` : ""}</p>
        ) : <p className="text-sm text-[var(--color-muted-foreground)]">Sin unidad asignada</p>}
      </Section>
      <Section title="Operador (figura transporte)">
        {p.operador ? <p className="text-sm">{dash(p.operador.nombre)} · RFC {dash(p.operador.rfc)} · Lic {dash(p.operador.licencia)}</p> : <p className="text-sm text-[var(--color-muted-foreground)]">Sin operador</p>}
      </Section>
      <Section title={`Mercancías · ${p.pesoTotalKg.toLocaleString("es-MX")} kg`}>
        {p.mercancias.length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">Sin mercancía</p> : (
          <div className="flex flex-col divide-y divide-[var(--color-border)]">
            {p.mercancias.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span className="min-w-0 truncate">{dash(m.clave)} · {m.descripcion}</span>
                <span className="shrink-0 text-xs text-[var(--color-muted-foreground)]">{m.cantidad} {dash(m.unidad)} · {m.pesoKg != null ? `${m.pesoKg} kg` : "—"}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
