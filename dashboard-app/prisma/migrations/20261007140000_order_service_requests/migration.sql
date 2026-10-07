CREATE TABLE "OrderServiceRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "orderItemId" TEXT,
    "orderItemName" TEXT,
    "replacementProduct" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "requestedBy" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderServiceRequest_code_key" ON "OrderServiceRequest"("code");
CREATE INDEX "OrderServiceRequest_orderId_createdAt_idx" ON "OrderServiceRequest"("orderId", "createdAt");
CREATE INDEX "OrderServiceRequest_status_createdAt_idx" ON "OrderServiceRequest"("status", "createdAt");
CREATE INDEX "OrderServiceRequest_orderItemId_idx" ON "OrderServiceRequest"("orderItemId");

ALTER TABLE "OrderServiceRequest"
ADD CONSTRAINT "OrderServiceRequest_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderServiceRequest"
ADD CONSTRAINT "OrderServiceRequest_orderItemId_fkey"
FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
