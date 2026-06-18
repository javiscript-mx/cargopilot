import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Boxes } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"
import { ContainersBlock } from "@/components/shipments/containers-block"
import { MerchandiseBlock } from "@/components/shipments/merchandise-block"
import { shipmentsApi } from "@/api/shipments"
import { useCatalog } from "@/hooks/use-catalog"
import { useToast } from "@/components/ui/toast"

interface Props {
  shipmentId: string
  cargoType: string | null
  canEdit: boolean
}

// Sección unificada de carga: la modalidad es el "dial" que reconfigura qué se captura.
export function CargoSection({ shipmentId, cargoType, canEdit }: Props) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { items: cargoTypes, simpleOptions: cargoOptions } = useCatalog("cargo_type")
  const cargoLabel = cargoType ? cargoTypes.find((t) => t.code === cargoType)?.name ?? cargoType : null
  const contenerizada = cargoType === "CONTAINER"

  const modalidadMutation = useMutation({
    mutationFn: (value: string) => shipmentsApi.update(shipmentId, { cargoType: value || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipments", shipmentId] })
      toast.success("Modalidad de carga actualizada")
    },
    onError: (err: Error) => toast.error("No se pudo actualizar la modalidad", err.message),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-[--color-muted-foreground]" /> Carga
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Modalidad — el interruptor que define qué se captura */}
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          {canEdit ? (
            <Select
              id="modalidad" label="Modalidad de carga"
              placeholder="Selecciona..."
              options={cargoOptions}
              value={cargoType ?? ""}
              onChange={(e) => modalidadMutation.mutate(e.target.value)}
            />
          ) : (
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-[--color-muted-foreground]">Modalidad de carga</span>
              <span className="font-medium">{cargoLabel ?? "—"}</span>
            </div>
          )}
        </div>

        {contenerizada && (
          <div className="border-t border-[--color-border] pt-4">
            <ContainersBlock shipmentId={shipmentId} canEdit={canEdit} />
          </div>
        )}

        <div className="border-t border-[--color-border] pt-4">
          <MerchandiseBlock shipmentId={shipmentId} canEdit={canEdit} contenerizada={contenerizada} />
        </div>
      </CardContent>
    </Card>
  )
}
