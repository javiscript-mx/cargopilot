-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'service';

-- Backfill: las facturas enlazadas como Carta Porte de una unidad son kind='carta_porte'
UPDATE "invoices" SET "kind" = 'carta_porte'
WHERE "id" IN (SELECT "cartaPorteInvoiceId" FROM "leg_vehicles" WHERE "cartaPorteInvoiceId" IS NOT NULL);
