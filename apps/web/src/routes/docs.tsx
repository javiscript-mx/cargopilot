import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { BookOpen, HelpCircle, Package, Building2, Landmark, Truck, FileCheck, Settings as SettingsIcon, ShieldCheck } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card } from "@/components/ui/card"

export const Route = createFileRoute("/docs")({
  component: DocsPage,
})

interface DocSection {
  id: string
  title: string
  icon: typeof BookOpen
  intro?: string
  blocks: { heading?: string; steps?: string[]; faqs?: { q: string; a: string }[]; note?: string }[]
}

const DOCS: DocSection[] = [
  {
    id: "inicio", title: "Introducción", icon: BookOpen,
    intro: "HM Sistema administra la operación de un agente de carga: expedientes de envío, clientes, facturación CFDI 4.0, Carta Porte, proveedores y compras.",
    blocks: [
      { heading: "Cómo está organizado", steps: [
        "Expedientes: el corazón de la operación; cada envío es un expediente con su ruta, carga, proceso y fiscal.",
        "Clientes: el catálogo con los datos fiscales que alimentan la facturación.",
        "Finanzas: agrupa Facturación (CFDI) y Compras (gastos por autorizar/pagar).",
        "Proveedores: transportistas y sus unidades, operadores y cuentas por pagar.",
        "Configuración: catálogos, datos del emisor, apariencia y módulos activos.",
      ] },
      { note: "Los módulos visibles dependen de tu rol y de los módulos habilitados en Configuración → Módulos." },
    ],
  },
  {
    id: "expedientes", title: "Expedientes", icon: Package,
    intro: "Un expediente representa un envío de punta a punta. Te guía con un semáforo de completitud (listo / faltante) y candados que evitan avanzar sin los datos necesarios.",
    blocks: [
      { heading: "Crear y operar un expediente", steps: [
        "Crea el expediente eligiendo el cliente y el tipo de operación.",
        "En Transporte define los tramos (ruta) y, en los foráneos, marca 'Requiere Carta Porte'.",
        "En Carga captura la mercancía (clave SAT, unidad, peso) y, si aplica, contenedores.",
        "Asigna a cada tramo su unidad (transportista + vehículo + operador autorizados).",
        "En Fiscal captura la cotización, genera la factura y, si aplica, timbra la Carta Porte.",
        "La barra superior 'Siguiente' te dice qué falta para avanzar al siguiente estado.",
      ] },
      { faqs: [
        { q: "¿Por qué no puedo confirmar o iniciar la operación?", a: "Falta un dato requerido. La barra de completitud y el botón ('faltan N') muestran exactamente qué completar." },
        { q: "¿Cómo marco que la mercancía llegó al cliente?", a: "El estado de la mercancía es automático: se deriva del avance de los tramos (en tránsito → en custodia → entregada)." },
      ] },
    ],
  },
  {
    id: "clientes", title: "Clientes", icon: Building2,
    intro: "El cliente concentra los datos fiscales (RFC, régimen, CP fiscal, uso CFDI) que la facturación reutiliza sin recapturar.",
    blocks: [
      { heading: "Buenas prácticas", steps: [
        "Captura RFC, razón social, régimen fiscal y CP fiscal: son obligatorios para timbrar.",
        "Define el uso de CFDI y la forma/método de pago por defecto del cliente.",
        "Registra direcciones: se usan como remitente/destinatario al armar los tramos.",
      ] },
      { faqs: [{ q: "El expediente me pide completar el cliente, ¿dónde?", a: "Desde el expediente, el enlace 'Ir a completar el cliente' te lleva al cliente con los campos faltantes resaltados." }] },
    ],
  },
  {
    id: "facturacion", title: "Finanzas · Facturación", icon: FileCheck,
    intro: "Facturación electrónica CFDI 4.0 vía Facturama: borrador → timbrado → PDF/XML.",
    blocks: [
      { heading: "Timbrar una factura", steps: [
        "Desde el expediente (Fiscal → Facturación) genera la factura a partir de la cotización (mismos servicios).",
        "Revisa uso de CFDI, método y forma de pago (vienen del cliente, son editables).",
        "Si el transporte aplica, marca 'Timbrar con complemento Carta Porte' y elige la unidad.",
        "Pulsa Timbrar. El PDF y XML quedan disponibles al timbrar.",
      ] },
      { faqs: [
        { q: "¿Qué es la retención de IVA del 4%?", a: "Aplica al autotransporte de carga cuando el receptor es persona moral; el sistema la calcula sola." },
        { q: "¿Puedo borrar una factura timbrada?", a: "No. Una vez timbrada solo se puede cancelar (CFDI). Los borradores sí se eliminan." },
      ] },
    ],
  },
  {
    id: "compras", title: "Finanzas · Compras", icon: Landmark,
    intro: "Registro y autorización de gastos/compras de los expedientes, con flujo por pagar → autorizado → pagado.",
    blocks: [
      { heading: "Flujo de un gasto", steps: [
        "Operaciones registra el gasto en el expediente (Fiscal → Gastos), con su comprobante (folio de factura o documento).",
        "En Finanzas → Compras, Finanzas/Admin autoriza el gasto (requiere comprobante) y luego lo marca como pagado.",
        "Filtra por periodo (último mes por defecto), estado, categoría o proveedor.",
      ] },
      { faqs: [
        { q: "¿Puedo guardar un gasto sin comprobante?", a: "Sí, queda 'pendiente de evidencia', pero no se puede autorizar ni finalizar el expediente hasta adjuntarlo." },
      ] },
    ],
  },
  {
    id: "carta-porte", title: "Carta Porte", icon: Truck,
    intro: "Complemento Carta Porte 3.1 para el traslado de mercancías por autotransporte.",
    blocks: [
      { heading: "Antes de timbrar", steps: [
        "Cada unidad de un tramo foráneo necesita: vehículo (placa, config, permiso SCT, seguro) y operador (RFC, licencia).",
        "El tramo necesita origen/destino con CP y estado, RFC de remitente y destinatario, distancia y fechas.",
        "La mercancía necesita clave SAT, unidad y peso (sin sobrepeso del límite legal).",
        "Usa la previsualización del complemento para revisar todo antes de timbrar.",
      ] },
      { note: "El emisor del CFDI Carta Porte es tu empresa; el receptor es tu cliente. En el tramo solo defines remitente (origen) y destinatario (destino) de la mercancía." },
    ],
  },
  {
    id: "proveedores", title: "Proveedores", icon: Truck,
    intro: "Transportistas y demás proveedores; los de autotransporte llevan unidades, operadores y remolques.",
    blocks: [
      { heading: "Qué registrar", steps: [
        "Marca el tipo de proveedor; si es autotransporte, aparecen Unidades, Operadores y Remolques.",
        "Autoriza unidades/operadores: solo los autorizados se pueden asignar a un tramo.",
        "En la pestaña 'Por pagar' ves los gastos/facturas pendientes con cada proveedor.",
      ] },
    ],
  },
  {
    id: "configuracion", title: "Configuración", icon: SettingsIcon,
    intro: "Datos del negocio y del emisor, apariencia, módulos activos y catálogos.",
    blocks: [
      { heading: "Lo más importante", steps: [
        "Facturación: CP del emisor, serie y régimen fiscal (necesarios para timbrar).",
        "Marca: nombre del sistema y logo que aparecen en el menú.",
        "Módulos: habilita/deshabilita módulos para tu operación.",
        "Apariencia: colores del sistema.",
      ] },
    ],
  },
  {
    id: "cuenta", title: "Mi cuenta y seguridad", icon: ShieldCheck,
    intro: "Cada usuario administra su perfil; los administradores gestionan usuarios y revisan la auditoría.",
    blocks: [
      { heading: "Perfil y contraseña", steps: [
        "En 'Mi perfil' (clic en tu nombre, abajo en el menú) cambias tu nombre y tu contraseña.",
        "El correo y el rol solo los cambia un administrador.",
        "Auditoría (solo admin) registra cada creación, actualización y borrado del sistema.",
      ] },
      { faqs: [{ q: "Olvidé mi contraseña", a: "Un administrador puede restablecerla desde Usuarios → Restablecer contraseña." }] },
    ],
  },
]

function DocsPage() {
  const [active, setActive] = useState("inicio")
  const section = DOCS.find((s) => s.id === active) ?? DOCS[0]!

  return (
    <AppLayout>
      <div className="mb-5 flex items-center gap-2.5">
        <HelpCircle className="h-6 w-6 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-xl font-bold">Documentación y ayuda</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">Guías por módulo y preguntas frecuentes.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {/* Índice */}
        <nav className="flex flex-col gap-1 lg:col-span-1">
          {DOCS.map((s) => {
            const on = s.id === active
            return (
              <button key={s.id} type="button" onClick={() => setActive(s.id)}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${on ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-foreground)] hover:bg-[var(--color-muted)]"}`}>
                <s.icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{s.title}</span>
              </button>
            )
          })}
        </nav>

        {/* Contenido */}
        <Card className="p-5 lg:col-span-3">
          <div className="flex items-center gap-2">
            <section.icon className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-bold">{section.title}</h2>
          </div>
          {section.intro && <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{section.intro}</p>}

          <div className="mt-4 flex flex-col gap-5">
            {section.blocks.map((b, i) => (
              <div key={i} className="flex flex-col gap-2">
                {b.heading && <h3 className="text-sm font-semibold">{b.heading}</h3>}
                {b.steps && (
                  <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-[var(--color-foreground)]">
                    {b.steps.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                )}
                {b.faqs && (
                  <div className="flex flex-col gap-2.5">
                    {b.faqs.map((f, j) => (
                      <div key={j} className="rounded-md border border-[var(--color-border)] p-3">
                        <p className="text-sm font-medium">{f.q}</p>
                        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{f.a}</p>
                      </div>
                    ))}
                  </div>
                )}
                {b.note && (
                  <p className="rounded-md border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800">{b.note}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
