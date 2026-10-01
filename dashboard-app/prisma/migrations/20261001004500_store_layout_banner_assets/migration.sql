CREATE TABLE IF NOT EXISTS "StoreLayoutAsset" (
  "key" TEXT NOT NULL,
  "imageData" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoreLayoutAsset_pkey" PRIMARY KEY ("key")
);
