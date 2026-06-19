-- AlterTable
ALTER TABLE "merchandise" ADD COLUMN     "legId" TEXT;

-- CreateIndex
CREATE INDEX "merchandise_legId_idx" ON "merchandise"("legId");

-- AddForeignKey
ALTER TABLE "merchandise" ADD CONSTRAINT "merchandise_legId_fkey" FOREIGN KEY ("legId") REFERENCES "shipment_legs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
