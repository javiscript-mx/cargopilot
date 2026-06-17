-- DropIndex
DROP INDEX "catalog_items_category_code_key";

-- CreateIndex
CREATE INDEX "catalog_items_category_active_idx" ON "catalog_items"("category", "active");

-- Unicidad (category, code) SOLO entre registros activos (índice parcial).
-- Permite múltiples inactivos con el mismo código (histórico de ediciones).
CREATE UNIQUE INDEX "catalog_items_category_code_active_key"
  ON "catalog_items"("category", "code") WHERE "active" = true;
