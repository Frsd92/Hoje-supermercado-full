ALTER TABLE "CouponCampaign"
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "maximumDiscountAmount" DECIMAL(12,2);

ALTER TABLE "LoyaltyReward"
ADD COLUMN "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "maximumDiscountAmount" DECIMAL(12,2);
