CREATE TABLE IF NOT EXISTS "CouponCampaign" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountPercent" INTEGER NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponCampaign_code_key" ON "CouponCampaign"("code");

CREATE TABLE IF NOT EXISTS "CouponRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  CONSTRAINT "CouponRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponRecipient_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "CouponCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponRecipient_campaignId_email_key" ON "CouponRecipient"("campaignId", "email");
CREATE INDEX IF NOT EXISTS "CouponRecipient_email_idx" ON "CouponRecipient"("email");

CREATE TABLE IF NOT EXISTS "CouponRedemption" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CouponRedemption_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "CouponCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_orderId_key" ON "CouponRedemption"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_campaignId_email_key" ON "CouponRedemption"("campaignId", "email");
CREATE INDEX IF NOT EXISTS "CouponRedemption_email_idx" ON "CouponRedemption"("email");
