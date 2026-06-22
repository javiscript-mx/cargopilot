-- CreateTable
CREATE TABLE "trailers" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "subType" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trailers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trailers_supplierId_active_idx" ON "trailers"("supplierId", "active");

-- AddForeignKey
ALTER TABLE "trailers" ADD CONSTRAINT "trailers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
