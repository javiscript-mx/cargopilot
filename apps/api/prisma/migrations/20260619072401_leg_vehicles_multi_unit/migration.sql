-- Migración: el transporte del tramo pasa a "unidades" (LegVehicle).
-- Un tramo puede correrse con 1..N unidades (sencillo, full con 2 remolques,
-- o 2 sencillos que reparten la carga). Cada unidad foránea = un CFDI Carta Porte.
-- Se preserva la data existente: cada tramo con transporte asignado se convierte
-- en una unidad, y su mercancía queda apuntando a esa unidad.

-- 1) Nueva tabla de unidades
CREATE TABLE "leg_vehicles" (
    "id" TEXT NOT NULL,
    "legId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "carrierSupplierId" TEXT,
    "vehicleId" TEXT,
    "operatorId" TEXT,
    "trailer1Plate" TEXT,
    "trailer1Type" TEXT,
    "trailer2Plate" TEXT,
    "trailer2Type" TEXT,
    "cartaPorteInvoiceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leg_vehicles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "leg_vehicles_legId_idx" ON "leg_vehicles"("legId");
ALTER TABLE "leg_vehicles" ADD CONSTRAINT "leg_vehicles_legId_fkey" FOREIGN KEY ("legId") REFERENCES "shipment_legs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Nueva columna en merchandise (unidad asignada)
ALTER TABLE "merchandise" ADD COLUMN "legVehicleId" TEXT;
CREATE INDEX "merchandise_legVehicleId_idx" ON "merchandise"("legVehicleId");

-- 3) Backfill: cada tramo con algún dato de transporte → una unidad (order 0)
INSERT INTO "leg_vehicles" ("id", "legId", "order", "carrierSupplierId", "vehicleId", "operatorId", "cartaPorteInvoiceId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", 0, "carrierSupplierId", "vehicleId", "operatorId", "cartaPorteInvoiceId", "createdAt", "updatedAt"
FROM "shipment_legs"
WHERE "carrierSupplierId" IS NOT NULL
   OR "vehicleId" IS NOT NULL
   OR "operatorId" IS NOT NULL
   OR "cartaPorteInvoiceId" IS NOT NULL;

-- 4) Backfill: mercancía asignada a un tramo → su unidad recién creada
UPDATE "merchandise" m
SET "legVehicleId" = lv."id"
FROM "leg_vehicles" lv
WHERE lv."legId" = m."legId" AND m."legId" IS NOT NULL;

-- 5) FK de merchandise → leg_vehicles (después del backfill)
ALTER TABLE "merchandise" ADD CONSTRAINT "merchandise_legVehicleId_fkey" FOREIGN KEY ("legVehicleId") REFERENCES "leg_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6) Eliminar las columnas de transporte del tramo (ya migradas a la unidad)
ALTER TABLE "shipment_legs" DROP COLUMN "carrierSupplierId",
DROP COLUMN "cartaPorteInvoiceId",
DROP COLUMN "operatorId",
DROP COLUMN "vehicleId";
