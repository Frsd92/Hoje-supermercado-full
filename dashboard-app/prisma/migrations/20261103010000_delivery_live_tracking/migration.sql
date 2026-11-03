CREATE TABLE "DeliveryTracking" (
    "orderId" TEXT NOT NULL,
    "tokenHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "locationUpdatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryTracking_pkey" PRIMARY KEY ("orderId")
);

CREATE UNIQUE INDEX "DeliveryTracking_tokenHash_key" ON "DeliveryTracking"("tokenHash");
CREATE INDEX "DeliveryTracking_active_expiresAt_idx" ON "DeliveryTracking"("active", "expiresAt");

ALTER TABLE "DeliveryTracking"
ADD CONSTRAINT "DeliveryTracking_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
