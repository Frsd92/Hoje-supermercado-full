CREATE TABLE "BlingConnection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlingConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
ADD COLUMN "blingSalesOrderId" TEXT,
ADD COLUMN "blingSalesOrderNumber" TEXT,
ADD COLUMN "blingSyncedAt" TIMESTAMP(3),
ADD COLUMN "blingSyncStatus" TEXT NOT NULL DEFAULT 'not_sent',
ADD COLUMN "blingSyncError" TEXT,
ADD COLUMN "blingSyncStartedAt" TIMESTAMP(3),
ADD COLUMN "blingNfceId" TEXT,
ADD COLUMN "blingNfceNumber" TEXT,
ADD COLUMN "blingNfceAccessKey" TEXT,
ADD COLUMN "blingNfceStatus" TEXT NOT NULL DEFAULT 'not_issued',
ADD COLUMN "blingNfceAuthorizedAt" TIMESTAMP(3),
ADD COLUMN "blingNfcePdfUrl" TEXT,
ADD COLUMN "blingNfceError" TEXT,
ADD COLUMN "blingNfceStartedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_blingSalesOrderId_key" ON "Order"("blingSalesOrderId");
CREATE UNIQUE INDEX "Order_blingNfceId_key" ON "Order"("blingNfceId");
