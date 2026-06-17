import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FileCheck } from "lucide-react"
import { Dialog } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { invoicesApi, type Invoice } from "@/api/invoices"

interface StampDialogProps {
  invoice: Invoice | null
  onClose: () => void
}

export function StampDialog({ invoice, onClose }: StampDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (id: string) => invoicesApi.stamp(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] })
      onClose()
    },
  })

  if (!invoice) return null

  const subtotal = parseFloat(invoice.subtotal)
  const tax = parseFloat(invoice.tax)
  const total = parseFloat(invoice.total)
  const fmt = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`

  return (
    <Dialog open={!!invoice} onClose={onClose} title="Timbrar factura">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md bg-blue-50 p-3">
          <FileCheck className="h-5 w-5 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">
            Esta acción enviará la factura al SAT a través de Facturama. Una vez timbrada no podrá editarse, solo cancelarse.
          </p>
        </div>

        <div className="rounded-md border border-[--color-border] p-4 text-sm">
          <div className="mb-3 flex justify-between">
            <span className="font-medium text-[--color-muted-foreground]">Folio</span>
            <span className="font-mono font-semibold">{invoice.series}-{invoice.folio}</span>
          </div>
          <div className="mb-3 flex justify-between">
            <span className="font-medium text-[--color-muted-foreground]">Cliente</span>
            <span>{invoice.customer.name}</span>
          </div>
          <div className="mb-3 flex justify-between">
            <span className="font-medium text-[--color-muted-foreground]">RFC</span>
            <span className="font-mono">{invoice.customer.rfc}</span>
          </div>
          <div className="mb-1 flex justify-between text-[--color-muted-foreground]">
            <span>Subtotal</span><span>{fmt(subtotal)}</span>
          </div>
          <div className="mb-1 flex justify-between text-[--color-muted-foreground]">
            <span>IVA 16%</span><span>{fmt(tax)}</span>
          </div>
          <div className="mt-2 flex justify-between border-t border-[--color-border] pt-2 font-bold">
            <span>Total</span><span>{fmt(total)}</span>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-[--color-destructive]">
            {(mutation.error as Error).message}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            loading={mutation.isPending}
            onClick={() => mutation.mutate(invoice.id)}
          >
            Confirmar y timbrar
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
