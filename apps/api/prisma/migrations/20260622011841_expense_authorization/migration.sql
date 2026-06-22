-- AlterTable
ALTER TABLE "shipment_expenses" ADD COLUMN     "authorizedAt" TIMESTAMP(3),
ADD COLUMN     "authorizedBy" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "shipment_expenses_supplierId_idx" ON "shipment_expenses"("supplierId");

-- CreateIndex
CREATE INDEX "shipment_expenses_status_idx" ON "shipment_expenses"("status");
