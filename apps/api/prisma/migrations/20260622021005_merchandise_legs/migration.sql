-- CreateTable
CREATE TABLE "merchandise_legs" (
    "id" TEXT NOT NULL,
    "merchandiseId" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "legVehicleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchandise_legs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchandise_legs_legId_idx" ON "merchandise_legs"("legId");

-- CreateIndex
CREATE INDEX "merchandise_legs_legVehicleId_idx" ON "merchandise_legs"("legVehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "merchandise_legs_merchandiseId_legId_key" ON "merchandise_legs"("merchandiseId", "legId");

-- AddForeignKey
ALTER TABLE "merchandise_legs" ADD CONSTRAINT "merchandise_legs_merchandiseId_fkey" FOREIGN KEY ("merchandiseId") REFERENCES "merchandise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchandise_legs" ADD CONSTRAINT "merchandise_legs_legId_fkey" FOREIGN KEY ("legId") REFERENCES "shipment_legs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchandise_legs" ADD CONSTRAINT "merchandise_legs_legVehicleId_fkey" FOREIGN KEY ("legVehicleId") REFERENCES "leg_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: copia la asignación legada (merchandise.legId/legVehicleId) a la tabla puente
INSERT INTO "merchandise_legs" ("id", "merchandiseId", "legId", "legVehicleId", "createdAt")
SELECT gen_random_uuid()::text, "id", "legId", "legVehicleId", CURRENT_TIMESTAMP
FROM "merchandise"
WHERE "legId" IS NOT NULL;
