-- AlterTable
ALTER TABLE "leg_task_templates" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic';

-- AlterTable
ALTER TABLE "leg_tasks" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic';

-- AlterTable
ALTER TABLE "shipment_tasks" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic';

-- AlterTable
ALTER TABLE "workflow_task_templates" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'generic';

-- CreateTable
CREATE TABLE "shipment_quotes" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "validUntil" TIMESTAMP(3),
    "items" JSONB,
    "estimatedCost" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipment_quotes_shipmentId_key" ON "shipment_quotes"("shipmentId");

-- AddForeignKey
ALTER TABLE "shipment_quotes" ADD CONSTRAINT "shipment_quotes_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: el paso "cotizar" usa el panel de cotización (kind=quote), tanto en la
-- plantilla como en los expedientes ya instanciados.
UPDATE "workflow_task_templates" SET "kind" = 'quote' WHERE "code" = 'cotizar';
UPDATE "shipment_tasks" SET "kind" = 'quote' WHERE "code" = 'cotizar';
