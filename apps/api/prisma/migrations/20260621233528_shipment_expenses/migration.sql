-- CreateTable
CREATE TABLE "shipment_expenses" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "supplierId" TEXT,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expenseDate" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "shipment_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipment_expenses_shipmentId_idx" ON "shipment_expenses"("shipmentId");

-- AddForeignKey
ALTER TABLE "shipment_expenses" ADD CONSTRAINT "shipment_expenses_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
