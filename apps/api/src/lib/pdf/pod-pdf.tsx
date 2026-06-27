import { readFileSync } from "node:fs"
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer"

// Logo embebido (mismo asset que el PDF de cotización). Si falta, se omite.
const LOGO_DATA_URI: string | null = (() => {
  try {
    const buf = readFileSync(new URL("../../assets/logo.png", import.meta.url))
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    return null
  }
})()

// POD / "Soporte de entrega en planta". Documento que se imprime, viaja con la unidad y el
// almacén del cliente LLENA, FIRMA y SELLA al recibir. El sistema pre-llena lo que sabe del
// expediente; el resto queda en blanco para llenarse a mano en la entrega.
// REGLA DE NEGOCIO: "Transportista" SIEMPRE es el forwarder (H&M), nunca el carrier real —
// no se revela al cliente (evita desintermediación). El transportista real vive en la Carta
// Porte, que NO se entrega al cliente.
export interface PodPdfInput {
  empresa: string // forwarder = transportista mostrado al cliente (H&M Del Mar Logistics)
  primary: string
  folio: string
  origen: string
  destino: string
  fullSencillo: "full" | "sencillo" | null
  localForaneo: "local" | "foraneo" | null
  cliente: string
  direccionEntrega: string
  referencia: string
  contenedor1: string
  contenedor2: string
  peso: string
  tipo: string
  sello: string
  unidad: string
  operador: string
  telefono: string // teléfono de despacho del forwarder (settings company.phone)
  lineaNaviera: string
  cargo: "normal" | "peligrosa" | "refrigerado" | "sobredimensionado"
  lugarCarga: string
}

const BORDER = "#9aa5b1"
const SHADE = "#eef2f7"

export async function renderPodPdf(input: PodPdfInput): Promise<Buffer> {
  const primary = input.primary
  const s = StyleSheet.create({
    page: { paddingHorizontal: 28, paddingVertical: 22, fontSize: 8.5, fontFamily: "Helvetica", color: "#1f2937" },
    // Encabezado
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    logo: { width: 88, height: 36, objectFit: "contain" },
    fecha: { fontSize: 9 },
    fechaLabel: { fontFamily: "Helvetica-Bold" },
    title: { textAlign: "center", color: primary, fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 8, letterSpacing: 0.5 },
    // Tabla
    table: { borderWidth: 1, borderColor: BORDER },
    row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: BORDER },
    rowLast: { flexDirection: "row" },
    // Celda etiqueta + valor
    labelCell: { backgroundColor: SHADE, paddingHorizontal: 5, paddingVertical: 3, borderRightWidth: 1, borderRightColor: BORDER, justifyContent: "center" },
    labelText: { fontFamily: "Helvetica-Bold", fontSize: 8 },
    valueCell: { flex: 1, paddingHorizontal: 5, paddingVertical: 3, justifyContent: "center" },
    valueText: { fontSize: 8.5 },
    // Separador vertical entre dos campos en una fila
    vsep: { borderRightWidth: 1, borderRightColor: BORDER },
    // Sección
    sectionHead: { backgroundColor: SHADE, borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 3 },
    sectionText: { textAlign: "center", color: primary, fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 0.5 },
    // Check cells
    checkCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 6, paddingVertical: 4 },
    box: { width: 9, height: 9, borderWidth: 1, borderColor: "#6b7280" },
    boxOn: { width: 9, height: 9, borderWidth: 1, borderColor: primary, backgroundColor: primary },
    checkLabel: { fontFamily: "Helvetica-Bold", fontSize: 8 },
    // Observaciones
    obsArea: { height: 64, borderBottomWidth: 1, borderBottomColor: BORDER },
    // Firmas
    signRow: { flexDirection: "row", borderWidth: 1, borderColor: BORDER, marginTop: 8 },
    signCol: { flex: 1, padding: 8 },
    signTitle: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 8.5, marginBottom: 22 },
    signLine: { borderTopWidth: 1, borderTopColor: "#4b5563", marginBottom: 4 },
    signField: { fontSize: 8, marginTop: 4 },
    stampBox: { height: 56, borderWidth: 1, borderStyle: "dashed", borderColor: "#9aa5b1", marginBottom: 6 },
    // Pie
    footerTitle: { textAlign: "center", color: primary, fontFamily: "Helvetica-Bold", fontSize: 8, marginTop: 8 },
    footerText: { textAlign: "center", fontSize: 7, color: "#6b7280", marginTop: 2 },
  })

  // Celda etiqueta+valor (ancho de etiqueta fijo, valor flexible)
  const Field = ({ label, value, labelW = 92, last = false }: { label: string; value?: string; labelW?: number; last?: boolean }) => (
    <View style={[{ flexDirection: "row", flex: 1 } as const, last ? {} : s.vsep]}>
      <View style={[s.labelCell, { width: labelW }]}><Text style={s.labelText}>{label}</Text></View>
      <View style={s.valueCell}><Text style={s.valueText}>{value || " "}</Text></View>
    </View>
  )

  const Check = ({ label, on }: { label: string; on: boolean }) => (
    <View style={s.checkCell}>
      <View style={on ? s.boxOn : s.box} />
      <Text style={s.checkLabel}>{label}</Text>
    </View>
  )

  const doc = (
    <Document title={`POD ${input.folio}`} author={input.empresa}>
      <Page size="A4" style={s.page}>
        {/* Encabezado */}
        <View style={s.header}>
          {LOGO_DATA_URI ? <Image src={LOGO_DATA_URI} style={s.logo} /> : <Text style={{ fontFamily: "Helvetica-Bold", color: primary }}>{input.empresa}</Text>}
          <Text style={s.fecha}><Text style={s.fechaLabel}>FECHA: </Text>____/____/________</Text>
        </View>
        <Text style={s.title}>SOPORTE DE ENTREGA EN PLANTA</Text>

        {/* Origen / Destino */}
        <View style={s.table}>
          <View style={s.row}>
            <Field label="Origen:" value={input.origen} labelW={56} />
            <Field label="Destino:" value={input.destino} labelW={56} last />
          </View>
          {/* FULL / SENCILLO / LOCAL / FORANEO */}
          <View style={[s.row, { backgroundColor: SHADE }]}>
            <Check label="FULL" on={input.fullSencillo === "full"} />
            <Check label="SENCILLO" on={input.fullSencillo === "sencillo"} />
            <Check label="LOCAL" on={input.localForaneo === "local"} />
            <Check label="FORÁNEO" on={input.localForaneo === "foraneo"} />
          </View>
          {/* Cliente */}
          <View style={s.row}><Field label="Cliente:" value={input.cliente} last /></View>
          <View style={s.row}><Field label="Dirección de Entrega:" value={input.direccionEntrega} last /></View>
          <View style={s.row}><Field label="Horario de recepción:" value="" last /></View>
          <View style={s.row}><Field label="Nombre de la Agencia:" value="" last /></View>
          <View style={s.row}><Field label="Contacto y Tel:" value="" last /></View>

          {/* DATOS DEL EMBARQUE */}
          <View style={s.sectionHead}><Text style={s.sectionText}>DATOS DEL EMBARQUE</Text></View>
          <View style={s.row}>
            <Field label="BL / Referencia:" value={input.referencia} />
            <Field label="Pedimento:" value="" last />
          </View>
          <View style={s.row}>
            <Field label="Contenedor 1:" value={input.contenedor1} />
            <Field label="Contenedor 2:" value={input.contenedor2} last />
          </View>
          <View style={s.row}>
            <Field label="Peso:" value={input.peso} />
            <Field label="Tipo:" value={input.tipo} last />
          </View>
          <View style={s.row}>
            <Field label="Línea / Naviera:" value={input.lineaNaviera} />
            <Field label="Sello:" value={input.sello} last />
          </View>
          <View style={s.row}>
            <Field label="Transportista:" value={input.empresa} />
            <Field label="Unidad:" value={input.unidad} last />
          </View>
          <View style={s.row}>
            <Field label="Operador:" value={input.operador} />
            <Field label="Teléfono:" value={input.telefono} last />
          </View>

          {/* Tipo de carga */}
          <View style={[s.row, { backgroundColor: SHADE }]}>
            <Check label="NORMAL" on={input.cargo === "normal"} />
            <Check label="CARGA PELIGROSA" on={input.cargo === "peligrosa"} />
            <Check label="REFRIGERADO" on={input.cargo === "refrigerado"} />
            <Check label="SOBREDIMENSIONADO" on={input.cargo === "sobredimensionado"} />
          </View>

          {/* Fechas */}
          <View style={s.row}>
            <Field label="Fecha de posicionamiento:" value="" labelW={130} />
            <Field label="Lugar de carga:" value={input.lugarCarga} labelW={84} last />
          </View>
          <View style={s.row}>
            <Field label="Fecha de internación en puerto:" value="" labelW={130} />
            <Field label="Fecha de entrega:" value="" labelW={84} last />
          </View>

          {/* Observaciones */}
          <View style={s.sectionHead}><Text style={s.sectionText}>OBSERVACIONES</Text></View>
          <View style={s.obsArea} />
        </View>

        {/* Firmas */}
        <View style={s.signRow}>
          <View style={[s.signCol, s.vsep]}>
            <Text style={s.signTitle}>FIRMA DE RECIBIDO ALMACÉN</Text>
            <View style={s.signLine} />
            <Text style={s.signField}>Nombre: __________________________________</Text>
            <Text style={s.signField}>Puesto: __________________________________</Text>
          </View>
          <View style={s.signCol}>
            <Text style={s.signTitle}>SELLO ALMACÉN</Text>
            <View style={s.stampBox} />
            <Text style={s.signField}>Nombre: __________________________________</Text>
          </View>
        </View>

        {/* Pie */}
        <Text style={s.footerTitle}>{input.empresa.toUpperCase()} — POD / SOPORTE DE ENTREGA EN PLANTA</Text>
        <Text style={s.footerText}>Este documento debe entregarse firmado y sellado, acompañado de evidencia fotográfica. La Carta Porte viaja con la unidad y se conserva en el expediente (no se entrega al cliente).</Text>
      </Page>
    </Document>
  )

  return renderToBuffer(doc)
}
