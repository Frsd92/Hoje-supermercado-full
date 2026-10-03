ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "addressDetails" JSONB,
  ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT NOT NULL DEFAULT 'nao_informado',
  ADD COLUMN IF NOT EXISTS "includeCpfOnReceipt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invoiceCpf" TEXT,
  ADD COLUMN IF NOT EXISTS "couponCode" TEXT,
  ADD COLUMN IF NOT EXISTS "couponDiscountPercent" INTEGER,
  ADD COLUMN IF NOT EXISTS "couponDiscountAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

ALTER TABLE "OrderItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(12, 3) USING "quantity"::DECIMAL(12, 3),
  ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'unidade',
  ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "promotionType" TEXT,
  ADD COLUMN IF NOT EXISTS "promotionDiscount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_customerEmail_idx" ON "Order"("customerEmail");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "OrderItem_productId_idx" ON "OrderItem"("productId");
