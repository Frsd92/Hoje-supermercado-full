ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "identityTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "identitySku" TEXT,
  ADD COLUMN IF NOT EXISTS "identityBarcode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_identityTitle_key"
  ON "Product" ("identityTitle");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_identitySku_key"
  ON "Product" ("identitySku");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_identityBarcode_key"
  ON "Product" ("identityBarcode");

CREATE TABLE IF NOT EXISTS "ProductBarcode" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  CONSTRAINT "ProductBarcode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductBarcode_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductBarcode_code_key"
  ON "ProductBarcode" ("code");
CREATE INDEX IF NOT EXISTS "ProductBarcode_productId_idx"
  ON "ProductBarcode" ("productId");

CREATE TABLE IF NOT EXISTS "ProductAuditLog" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productExternalId" TEXT,
  "productTitle" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB,
  "changes" JSONB,
  "note" TEXT,
  CONSTRAINT "ProductAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductAuditLog_productId_occurredAt_idx"
  ON "ProductAuditLog" ("productId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ProductAuditLog_productExternalId_occurredAt_idx"
  ON "ProductAuditLog" ("productExternalId", "occurredAt");
