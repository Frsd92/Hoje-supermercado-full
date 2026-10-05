ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "productCode" TEXT;

CREATE TABLE "OrderRefundRequest" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requestedBy" TEXT NOT NULL,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderRefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderRefundEvent" (
  "id" TEXT NOT NULL,
  "refundRequestId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderRefundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderRefundRequest_code_key" ON "OrderRefundRequest"("code");
CREATE INDEX "OrderRefundRequest_orderId_createdAt_idx" ON "OrderRefundRequest"("orderId", "createdAt");
CREATE INDEX "OrderRefundRequest_status_createdAt_idx" ON "OrderRefundRequest"("status", "createdAt");
CREATE INDEX "OrderRefundEvent_refundRequestId_createdAt_idx" ON "OrderRefundEvent"("refundRequestId", "createdAt");

ALTER TABLE "OrderRefundRequest"
  ADD CONSTRAINT "OrderRefundRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderRefundEvent"
  ADD CONSTRAINT "OrderRefundEvent_refundRequestId_fkey"
  FOREIGN KEY ("refundRequestId") REFERENCES "OrderRefundRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
