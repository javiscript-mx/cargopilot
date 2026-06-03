import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Package } from "lucide-react"
import { AppLayout } from "@/components/layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { shipmentsApi, type ShipmentStatus } from "@/api/shipments"

export const Route = createFileRoute("/shipments/$id")({
  component: ShipmentDetailPage,
})

const statusConfig: Record<ShipmentStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "outline" }> = {
  draft: { label: "Borrador", variant: "outline" },
  confirmed: { label: "Confirmado", variant: "default" },
  in_transit: { label: "En tránsito", variant: "warning" },
  delivered: { label: "Entregado", variant: "success" },
  cancelled: { label: "Cancelado", variant: "destructive" },
}

const transitions: Record<ShipmentStatus, ShipmentStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["in_transit", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
}

const transitionLabels: Record<ShipmentStatus, string> = {
  confirmed: "Confirmar expediente",
  in_transit: "Marcar en tránsito",
  delivered: "Marcar como entregado",
  cancelled: "Cancelar",
  draft: "",
}

function ShipmentDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()

  const { data: shipment, isLoading } = useQuery({
    queryKey: ["shipments", id],
    queryFn: () => shipmentsApi.get(id),
  })

  const mutation = useMutation({
    mutationFn: (status: ShipmentStatus) => shipmentsApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", id] })
      queryClient.invalidateQueries({ queryKey: ["shipments"] })
    },
  })

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-[--color-muted-foreground]">Cargando...</div>
      </AppLayout>
    )
  }

  if (!shipment) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Package className="h-12 w-12 opacity-30" />
          <p className="text-[--color-muted-foreground]">Expediente no encontrado</p>
          <Link to="/shipments"><Button variant="outline">Volver</Button></Link>
        </div>
      </AppLayout>
    )
  }

  const status = statusConfig[shipment.status]
  const nextStatuses = transitions[shipment.status]

  return (
    <AppLayout>
      <div className="mb-6">
        <Link to="/shipments" className="mb-4 flex items-center gap-2 text-sm text-[--color-muted-foreground] hover:text-[--color-foreground]">
          <ArrowLeft className="h-4 w-4" /> Expedientes
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono">{shipment.folio}</h1>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          {nextStatuses.length > 0 && (
            <div className="flex gap-2">
              {nextStatuses.map((next) => (
                <Button
                  key={next}
                  variant={next === "cancelled" ? "destructive" : "default"}
                  size="sm"
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate(next)}
                >
                  {transitionLabels[next]}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Datos del envío</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Origen" value={shipment.origin} />
            <Row label="Destino" value={shipment.destination} />
            <Row label="Carga" value={shipment.cargo.description} />
            {shipment.cargo.weight && <Row label="Peso" value={`${shipment.cargo.weight} kg`} />}
            {shipment.cargo.units && <Row label="Unidades" value={String(shipment.cargo.units)} />}
            {shipment.notes && <Row label="Notas" value={shipment.notes} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Nombre" value={shipment.customer.name} />
            <Row label="RFC" value={<span className="font-mono">{shipment.customer.rfc}</span>} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Línea de tiempo</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-0">
              {(["draft", "confirmed", "in_transit", "delivered"] as ShipmentStatus[]).map((s, idx, arr) => {
                const statuses: ShipmentStatus[] = ["draft", "confirmed", "in_transit", "delivered", "cancelled"]
                const currentIdx = statuses.indexOf(shipment.status)
                const stepIdx = statuses.indexOf(s)
                const isDone = shipment.status === "cancelled" ? false : currentIdx >= stepIdx
                const isCurrent = shipment.status === s
                return (
                  <div key={s} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
                        isDone ? "border-[--color-primary] bg-[--color-primary] text-[--color-primary-foreground]"
                        : "border-[--color-border] bg-[--color-background] text-[--color-muted-foreground]"
                      } ${isCurrent ? "ring-2 ring-offset-2 ring-[--color-primary]" : ""}`}>
                        {idx + 1}
                      </div>
                      <span className={`text-xs whitespace-nowrap ${isDone ? "text-[--color-foreground]" : "text-[--color-muted-foreground]"}`}>
                        {statusConfig[s].label}
                      </span>
                    </div>
                    {idx < arr.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 ${isDone && currentIdx > stepIdx ? "bg-[--color-primary]" : "bg-[--color-border]"}`} />
                    )}
                  </div>
                )
              })}
            </div>
            {shipment.status === "cancelled" && (
              <p className="mt-3 text-sm text-[--color-destructive] font-medium">Expediente cancelado</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-[--color-muted-foreground] shrink-0">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
