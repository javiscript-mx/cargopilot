-- DropForeignKey
ALTER TABLE "shipment_expenses" DROP CONSTRAINT "shipment_expenses_shipmentId_fkey";

-- AlterTable
ALTER TABLE "shipment_expenses" ALTER COLUMN "shipmentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "shipment_expenses" ADD CONSTRAINT "shipment_expenses_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
