-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "fiscalRegime" TEXT,
ADD COLUMN     "fiscalZipCode" TEXT;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "items" JSONB,
ADD COLUMN     "paymentForm" TEXT NOT NULL DEFAULT '03',
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'PUE';
