-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "cargoType" TEXT;

-- CreateTable
CREATE TABLE "merchandise" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitKey" TEXT,
    "weight" DECIMAL(12,3),
    "value" DECIMAL(14,2),
    "productKey" TEXT,
    "hsCode" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchandise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchandise_shipmentId_idx" ON "merchandise"("shipmentId");

-- AddForeignKey
ALTER TABLE "merchandise" ADD CONSTRAINT "merchandise_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
