-- AlterTable
ALTER TABLE "merchandise" ADD COLUMN     "containerId" TEXT;

-- CreateTable
CREATE TABLE "containers" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT,
    "seal" TEXT,
    "tare" DECIMAL(10,3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "containers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "containers_shipmentId_idx" ON "containers"("shipmentId");

-- CreateIndex
CREATE INDEX "merchandise_containerId_idx" ON "merchandise"("containerId");

-- AddForeignKey
ALTER TABLE "containers" ADD CONSTRAINT "containers_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchandise" ADD CONSTRAINT "merchandise_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "containers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
