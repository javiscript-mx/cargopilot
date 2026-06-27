import { readFileSync } from "node:fs"
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer"
import { computeTaxes, personaFromRfc } from "../taxes.js"

// Logo embebido una sola vez como data URI. Vive en src/assets (incluido en la imagen
// Docker, que corre con tsx desde src/). Si falta, el documento se genera sin logo.
const LOGO_DATA_URI: string | null = (() => {
  try {
    const buf = readFileSync(new URL("../../assets/logo.png", import.meta.url))
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    return null
  }
})()

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
}

// IMPORTANTE: este documento es para el CLIENTE. Solo lleva precios de venta.
// El costo estimado y el margen son internos y NUNCA deben aparecer aquí.
export interface QuotePdfInput {
  emisor: { businessName: string; name: string; rfc: string; regimen: string; cp: string; phone: string; email: string; website: string; address: string }
  branding: { primary: string; accent: string }
  folio: string
  issuedAt: Date
  validUntil: Date | null
  status: string
  currency: string
  customer: { name: string; rfc: string; email: string | null; phone: string | null }
  service: {
    operation: string | null
    transport: string | null
    cargo: string | null
    origin: string | null
    destination: string | null
    reference: string | null
  }
  items: { concept: string; amount: number; productKey?: string | null }[]
  notes: string | null
}

const fmtDate = (d: Date): string =>
  new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "long", year: "numeric" }).format(d)

const makeMoney = (currency: string) => {
  const nf = new Intl.NumberFormat("es-MX", { style: "currency", currency })
  return (n: number) => nf.format(n)
}

// Términos y condiciones estándar de forwarding. Texto base editable a futuro (settings).
const termsFor = (businessName: string, currency: string): string[] => [
  `Cotización válida hasta la fecha de vigencia indicada; pasada esa fecha las tarifas pueden cambiar sin previo aviso.`,
  `Tarifas sujetas a disponibilidad de cupo y equipo al momento de confirmar el servicio.`,
  `No incluye maniobras, almacenajes, demoras ni cargos por servicios no especificados en esta cotización.`,
  `Variaciones en peso, volumen, dimensiones o ruta pueden modificar la tarifa.`,
  `Precios expresados en ${currency}. Los impuestos aplicables (IVA y retenciones) se muestran en el desglose de totales.`,
  `El servicio se sujeta a los términos y condiciones generales de contratación de ${businessName}.`,
]

export async function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  const { emisor, branding, customer, service, items, currency } = input
  const primary = branding.primary
  const accent = branding.accent
  const money = makeMoney(currency)
  const tax = computeTaxes(
    items.map((i) => ({ amount: i.amount, productCode: i.productKey ?? null })),
    personaFromRfc(customer.rfc),
  )

  const styles = StyleSheet.create({
    page: { paddingBottom: 64, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937", lineHeight: 1.4 },
    header: {
      backgroundColor: primary,
      paddingHorizontal: 32,
      paddingVertical: 18,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    logo: { width: 42, height: 42, objectFit: "contain" },
    emisorName: { color: "#ffffff", fontSize: 14, fontFamily: "Helvetica-Bold" },
    emisorMeta: { color: "#dbe4ef", fontSize: 8, marginTop: 2 },
    headerRight: { alignItems: "flex-end" },
    docTitle: { color: "#ffffff", fontSize: 18, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
    folio: { color: "#dbe4ef", fontSize: 10, marginTop: 2 },
    accentRule: { height: 4, backgroundColor: accent },
    body: { paddingHorizontal: 32, paddingTop: 18 },

    metaRow: { flexDirection: "row", gap: 24, marginBottom: 16 },
    metaItem: {},
    metaLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 },
    metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827", marginTop: 1 },

    cols: { flexDirection: "row", gap: 24, marginBottom: 18 },
    col: { flex: 1 },
    sectionTitle: {
      fontSize: 8,
      fontFamily: "Helvetica-Bold",
      color: primary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 5,
      paddingBottom: 3,
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
    },
    strong: { fontFamily: "Helvetica-Bold", color: "#111827" },
    line: { marginBottom: 1 },
    infoRow: { flexDirection: "row", marginBottom: 1 },
    infoLabel: { width: 64, color: "#6b7280" },
    infoValue: { flex: 1, color: "#111827" },

    table: { marginBottom: 4 },
    trHead: { flexDirection: "row", backgroundColor: primary, paddingVertical: 6, paddingHorizontal: 8 },
    thConcept: { flex: 1, color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
    thAmount: { width: 110, color: "#ffffff", fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, textAlign: "right" },
    tr: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: "#eef1f4" },
    zebra: { backgroundColor: "#f8fafc" },
    tdConcept: { flex: 1, color: "#111827" },
    tdAmount: { width: 110, textAlign: "right", color: "#111827" },

    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 10 },
    totalsBox: { width: 240 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
    totalLabel: { color: "#6b7280" },
    totalValue: { color: "#111827", textAlign: "right" },
    grandRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: 1.5,
      borderTopColor: primary,
    },
    grandLabel: { fontFamily: "Helvetica-Bold", color: primary, fontSize: 11 },
    grandValue: { fontFamily: "Helvetica-Bold", color: primary, fontSize: 11, textAlign: "right" },

    block: { marginTop: 18 },
    notesText: { color: "#374151" },
    termLine: { color: "#6b7280", fontSize: 8, marginBottom: 2 },

    footer: {
      position: "absolute",
      bottom: 24,
      left: 32,
      right: 32,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 7,
      color: "#9ca3af",
      borderTopWidth: 1,
      borderTopColor: "#e5e7eb",
      paddingTop: 6,
    },
  })

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )

  // Origen→destino: la fuente base de PDF (Helvetica) no trae el glifo de flecha (U+2192),
  // así que usamos guion largo; la dirección queda implícita por el orden.
  const route =
    service.origin || service.destination
      ? [service.origin, service.destination].filter(Boolean).join("   —   ")
      : null

  // Línea de contacto del pie (datos comerciales de settings; se omiten los vacíos).
  const contactLine = [
    emisor.phone ? `Tel ${emisor.phone}` : "",
    emisor.email,
    emisor.website,
  ].filter(Boolean).join("   ·   ")

  const doc = (
    <Document title={`Cotización ${input.folio}`} author={emisor.businessName}>
      <Page size="A4" style={styles.page}>
        {/* Membrete */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            {LOGO_DATA_URI ? <Image src={LOGO_DATA_URI} style={styles.logo} /> : null}
            <View>
              <Text style={styles.emisorName}>{emisor.businessName}</Text>
              <Text style={styles.emisorMeta}>
                {emisor.name ? `${emisor.name} · ` : ""}RFC {emisor.rfc || "—"}
              </Text>
              {emisor.address ? <Text style={styles.emisorMeta}>{emisor.address}</Text> : null}
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>COTIZACIÓN</Text>
            <Text style={styles.folio}>{input.folio}</Text>
          </View>
        </View>
        <View style={styles.accentRule} fixed />

        <View style={styles.body}>
          {/* Meta */}
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Fecha</Text>
              <Text style={styles.metaValue}>{fmtDate(input.issuedAt)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Vigencia</Text>
              <Text style={styles.metaValue}>{input.validUntil ? fmtDate(input.validUntil) : "—"}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Estado</Text>
              <Text style={styles.metaValue}>{STATUS_LABEL[input.status] ?? input.status}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Moneda</Text>
              <Text style={styles.metaValue}>{currency}</Text>
            </View>
          </View>

          {/* Cliente + Servicio */}
          <View style={styles.cols}>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>Cliente</Text>
              <Text style={[styles.strong, styles.line]}>{customer.name}</Text>
              <Text style={styles.line}>RFC: {customer.rfc || "—"}</Text>
              {customer.email ? <Text style={styles.line}>{customer.email}</Text> : null}
              {customer.phone ? <Text style={styles.line}>{customer.phone}</Text> : null}
            </View>
            <View style={styles.col}>
              <Text style={styles.sectionTitle}>Datos del servicio</Text>
              {service.operation ? <InfoRow label="Operación" value={service.operation} /> : null}
              {service.transport ? <InfoRow label="Transporte" value={service.transport} /> : null}
              {service.cargo ? <InfoRow label="Carga" value={service.cargo} /> : null}
              {route ? <InfoRow label="Ruta" value={route} /> : null}
              {service.reference ? <InfoRow label="Referencia" value={service.reference} /> : null}
            </View>
          </View>

          {/* Conceptos */}
          <View style={styles.table}>
            <View style={styles.trHead}>
              <Text style={styles.thConcept}>Concepto</Text>
              <Text style={styles.thAmount}>Importe</Text>
            </View>
            {items.map((it, i) => (
              <View key={i} style={i % 2 === 1 ? [styles.tr, styles.zebra] : styles.tr} wrap={false}>
                <Text style={styles.tdConcept}>{it.concept || "—"}</Text>
                <Text style={styles.tdAmount}>{money(it.amount)}</Text>
              </View>
            ))}
          </View>

          {/* Totales */}
          <View style={styles.totalsWrap}>
            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{money(tax.subtotal)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>IVA (16%)</Text>
                <Text style={styles.totalValue}>{money(tax.ivaTraslado)}</Text>
              </View>
              {tax.retentionApplies ? (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Retención IVA (4%)</Text>
                  <Text style={styles.totalValue}>− {money(tax.ivaRetencion)}</Text>
                </View>
              ) : null}
              <View style={styles.grandRow}>
                <Text style={styles.grandLabel}>Total</Text>
                <Text style={styles.grandValue}>{money(tax.total)}</Text>
              </View>
            </View>
          </View>

          {/* Notas */}
          {input.notes ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>Notas</Text>
              <Text style={styles.notesText}>{input.notes}</Text>
            </View>
          ) : null}

          {/* Términos y condiciones */}
          <View style={styles.block}>
            <Text style={styles.sectionTitle}>Términos y condiciones</Text>
            {termsFor(emisor.businessName, currency).map((t, i) => (
              <Text key={i} style={styles.termLine}>
                •  {t}
              </Text>
            ))}
          </View>
        </View>

        {/* Pie */}
        <View style={styles.footer} fixed>
          <View>
            <Text>{emisor.businessName}{emisor.rfc ? ` · RFC ${emisor.rfc}` : ""}</Text>
            {contactLine ? <Text>{contactLine}</Text> : null}
          </View>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )

  return renderToBuffer(doc)
}
