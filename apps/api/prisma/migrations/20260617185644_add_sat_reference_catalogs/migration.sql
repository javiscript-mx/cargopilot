-- CreateTable
CREATE TABLE "sat_product_keys" (
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dangerous" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sat_product_keys_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "sat_unit_keys" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,

    CONSTRAINT "sat_unit_keys_pkey" PRIMARY KEY ("code")
);
