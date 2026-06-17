-- Customer master expansion for forwarding operations and fiscal readiness.
DROP INDEX IF EXISTS "customers_rfc_key";

ALTER TABLE "customers"
ADD COLUMN "legalName" TEXT,
ADD COLUMN "tradeName" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'prospect',
ADD COLUMN "customerType" TEXT NOT NULL DEFAULT 'shipper',
ADD COLUMN "taxCountry" TEXT NOT NULL DEFAULT 'MX',
ADD COLUMN "foreignTaxId" TEXT,
ADD COLUMN "defaultCfdiUse" TEXT,
ADD COLUMN "defaultPaymentForm" TEXT,
ADD COLUMN "defaultPaymentMethod" TEXT,
ADD COLUMN "billingEmail" TEXT,
ADD COLUMN "creditTermsDays" INTEGER,
ADD COLUMN "creditLimit" DECIMAL(14,2),
ADD COLUMN "creditCurrency" TEXT NOT NULL DEFAULT 'MXN',
ADD COLUMN "salesOwner" TEXT,
ADD COLUMN "operationsNotes" TEXT,
ADD COLUMN "billingNotes" TEXT,
ADD COLUMN "complianceStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "documentsStatus" TEXT NOT NULL DEFAULT 'pending';

CREATE INDEX "customers_rfc_idx" ON "customers"("rfc");
CREATE INDEX "customers_status_idx" ON "customers"("status");

CREATE TABLE "customer_contacts" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'operations',
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "mobile" TEXT,
  "position" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_addresses" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'commercial',
  "label" TEXT,
  "address" JSONB,
  "formatted" TEXT,
  "street" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "postalCode" TEXT,
  "lat" DECIMAL(10,7),
  "lng" DECIMAL(10,7),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_contacts_customerId_type_idx" ON "customer_contacts"("customerId", "type");
CREATE INDEX "customer_addresses_customerId_type_idx" ON "customer_addresses"("customerId", "type");

ALTER TABLE "customer_contacts"
ADD CONSTRAINT "customer_contacts_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_addresses"
ADD CONSTRAINT "customer_addresses_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
