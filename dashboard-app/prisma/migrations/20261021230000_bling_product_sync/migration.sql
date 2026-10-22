ALTER TABLE "Product"
ADD COLUMN "blingProductId" TEXT,
ADD COLUMN "blingSyncStatus" TEXT NOT NULL DEFAULT 'not_synced',
ADD COLUMN "blingSyncError" TEXT,
ADD COLUMN "blingSyncedAt" TIMESTAMP(3),
ADD COLUMN "blingSyncStartedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Product_blingProductId_key" ON "Product"("blingProductId");
