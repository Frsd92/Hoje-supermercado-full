CREATE TABLE "ProductLot" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "identityKey" TEXT NOT NULL,
  "lotCode" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "expiry" DATE,
  "manufactureDate" DATE,
  "location" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceReference" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductLot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductLot_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ProductLot_productId_expiry_idx"
  ON "ProductLot" ("productId", "expiry");
CREATE INDEX "ProductLot_productId_quantity_idx"
  ON "ProductLot" ("productId", "quantity");
CREATE UNIQUE INDEX "ProductLot_identityKey_key"
  ON "ProductLot" ("identityKey");

CREATE TABLE "InventoryOrderFulfillment" (
  "orderId" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryOrderFulfillment_pkey" PRIMARY KEY ("orderId")
);

CREATE INDEX "InventoryOrderFulfillment_createdAt_idx"
  ON "InventoryOrderFulfillment" ("createdAt");

CREATE TABLE "InventoryLotAllocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemIndex" INTEGER NOT NULL,
  "lotId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "lotCode" TEXT,
  "quantity" DECIMAL(12,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryLotAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryLotAllocation_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "InventoryOrderFulfillment" ("orderId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryLotAllocation_lotId_fkey" FOREIGN KEY ("lotId")
    REFERENCES "ProductLot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryLotAllocation_orderId_orderItemIndex_lotId_key"
  ON "InventoryLotAllocation" ("orderId", "orderItemIndex", "lotId");
CREATE INDEX "InventoryLotAllocation_orderId_idx"
  ON "InventoryLotAllocation" ("orderId");
CREATE INDEX "InventoryLotAllocation_lotId_idx"
  ON "InventoryLotAllocation" ("lotId");

INSERT INTO "ProductLot" (
  "id",
  "productId",
  "identityKey",
  "lotCode",
  "quantity",
  "expiry",
  "location",
  "source",
  "sourceReference",
  "createdBy",
  "createdAt",
  "updatedAt"
)
SELECT
  'opening_' || product."id",
  product."id",
  'legacy:' || product."id",
  NULLIF(BTRIM(product."metadata"->>'lot'), ''),
  product."quantity",
  product."expiry"::date,
  NULLIF(BTRIM(product."metadata"->>'location'), ''),
  'MIGRATION',
  'initial-product-stock',
  product."createdBy",
  product."createdAt",
  product."updatedAt"
FROM "Product" AS product
WHERE product."quantity" > 0;
