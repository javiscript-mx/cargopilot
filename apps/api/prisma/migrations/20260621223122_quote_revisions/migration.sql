-- CreateTable
CREATE TABLE "quote_revisions" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "items" JSONB,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "estimatedCost" DECIMAL(14,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "quote_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_revisions_shipmentId_idx" ON "quote_revisions"("shipmentId");

-- AddForeignKey
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
