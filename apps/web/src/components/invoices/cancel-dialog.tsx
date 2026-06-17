import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AlertTriangle } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Select } from "@/components/ui/select"
import { invoicesApi, type Invoice } from "@/api/invoices"

// Motivos SAT que no requieren folio de sustitución
const MOTIVES = [
  { value: "02", label: "02 - Comprobante emitido con errores sin relación" },
  { value: "03", label: "03 - No se llevó a cabo la operación" },
  { value: "04", label: "04 - Operación nominativa en factura global" },
]

interface CancelDialogProps {
  invoice: Invoice | null
  onClose: () => void
}

export function CancelDialog({ invoice, onClose }: CancelDialogProps) {
  const queryClient = useQueryClient()
  const [motive, setMotive] = useState("02")

  const mutation = useMutation({
    mutationFn: () => invoicesApi.cancel(invoice!.id, motive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      onClose()
    },
  })

  if (!invoice) return null

  return (
    <Dialog open={!!invoice} onClose={onClose} title="Cancelar factura">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            Se solicitará la cancelación del CFDI <span className="font-mono font-semibold">{invoice.series}-{invoice.folio}</span> ante el SAT vía Facturama. Esta acción no se puede revertir.
          </p>
        </div>

        <Select
          id="motive" label="Motivo de cancelación (SAT)"
          options={MOTIVES}
          value={motive}
          onChange={(e) => setMotive(e.target.value)}
        />

        {mutation.isError && (
          <p className="text-sm text-[--color-destructive]">{(mutation.error as Error).message}</p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cerrar
          </Button>
          <Button variant="destructive" loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Cancelar factura
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
