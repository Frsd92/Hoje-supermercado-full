ALTER TABLE "Order"
  ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "checkoutRequestId" TEXT,
  ADD COLUMN "pagarmeOrderId" TEXT,
  ADD COLUMN "pagarmeChargeId" TEXT,
  ADD COLUMN "paymentDetails" JSONB,
  ADD COLUMN "refundedAmount" DECIMAL(12, 2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Order_pagarmeOrderId_key" ON "Order"("pagarmeOrderId");
CREATE UNIQUE INDEX "Order_checkoutRequestId_key" ON "Order"("checkoutRequestId");
CREATE UNIQUE INDEX "Order_pagarmeChargeId_key" ON "Order"("pagarmeChargeId");

CREATE TABLE "PagarmeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "orderId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagarmeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PagarmeWebhookEvent_orderId_receivedAt_idx" ON "PagarmeWebhookEvent"("orderId", "receivedAt");
CREATE INDEX "PagarmeWebhookEvent_eventType_receivedAt_idx" ON "PagarmeWebhookEvent"("eventType", "receivedAt");

ALTER TABLE "PagarmeWebhookEvent"
  ADD CONSTRAINT "PagarmeWebhookEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
