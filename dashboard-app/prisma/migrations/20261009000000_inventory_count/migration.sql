CREATE TABLE "InventoryCount" (
  "id" TEXT NOT NULL,
  "activeKey" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedBy" TEXT,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryCount_activeKey_key"
  ON "InventoryCount" ("activeKey");
CREATE INDEX "InventoryCount_status_createdAt_idx"
  ON "InventoryCount" ("status", "createdAt");

CREATE TABLE "InventoryCountItem" (
  "id" TEXT NOT NULL,
  "countId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productTitle" TEXT NOT NULL,
  "productSku" TEXT,
  "productBarcode" TEXT,
  "productStatus" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "sourceCategory" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'un.',
  "systemQuantity" DECIMAL(12,3) NOT NULL,
  "countedQuantity" DECIMAL(12,3),
  "countedAt" TIMESTAMP(3),
  CONSTRAINT "InventoryCountItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCountItem_countId_fkey" FOREIGN KEY ("countId")
    REFERENCES "InventoryCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryCountItem_countId_productId_key"
  ON "InventoryCountItem" ("countId", "productId");
CREATE INDEX "InventoryCountItem_countId_category_productTitle_idx"
  ON "InventoryCountItem" ("countId", "category", "productTitle");
