ALTER TABLE "CouponCampaign"
ADD COLUMN "minimumOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "LoyaltyMission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ruleType" TEXT NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "targetCount" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "pointsReward" INTEGER NOT NULL,
    "rewardLimit" INTEGER,
    "claimedRewards" INTEGER NOT NULL DEFAULT 0,
    "recurrence" TEXT NOT NULL DEFAULT 'none',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "pointsExpiryPolicy" TEXT NOT NULL DEFAULT 'CYCLE_END',
    "pointsExpiryDays" INTEGER,
    "pointsExpireAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyMission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyMissionProgress" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "cycleStartAt" TIMESTAMP(3) NOT NULL,
    "cycleEndAt" TIMESTAMP(3) NOT NULL,
    "progressCount" INTEGER NOT NULL DEFAULT 0,
    "progressAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyMissionProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyMissionContribution" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contributionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "contributionCount" INTEGER NOT NULL DEFAULT 1,
    "contributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyMissionContribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pointsCost" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "minimumOrderAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyRewardRedemption" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "couponCampaignId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyRewardRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyPointEntry" (
    "id" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "missionId" TEXT,
    "progressId" TEXT,
    "sourceOrderId" TEXT,
    "rewardRedemptionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyPointEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LoyaltyPointAllocation" (
    "id" TEXT NOT NULL,
    "redemptionEntryId" TEXT NOT NULL,
    "awardEntryId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoyaltyPointAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoyaltyMission_status_startsAt_idx"
ON "LoyaltyMission"("status", "startsAt");
CREATE INDEX "LoyaltyMission_endsAt_idx"
ON "LoyaltyMission"("endsAt");
CREATE UNIQUE INDEX "LoyaltyMissionProgress_missionId_customerEmail_cycleStartAt_key"
ON "LoyaltyMissionProgress"("missionId", "customerEmail", "cycleStartAt");
CREATE INDEX "LoyaltyMissionProgress_customerEmail_updatedAt_idx"
ON "LoyaltyMissionProgress"("customerEmail", "updatedAt");
CREATE INDEX "LoyaltyMissionProgress_missionId_completedAt_idx"
ON "LoyaltyMissionProgress"("missionId", "completedAt");
CREATE UNIQUE INDEX "LoyaltyMissionContribution_progressId_orderId_key"
ON "LoyaltyMissionContribution"("progressId", "orderId");
CREATE INDEX "LoyaltyMissionContribution_missionId_contributedAt_idx"
ON "LoyaltyMissionContribution"("missionId", "contributedAt");
CREATE INDEX "LoyaltyMissionContribution_orderId_idx"
ON "LoyaltyMissionContribution"("orderId");
CREATE UNIQUE INDEX "LoyaltyRewardRedemption_requestId_key"
ON "LoyaltyRewardRedemption"("requestId");
CREATE UNIQUE INDEX "LoyaltyRewardRedemption_couponCampaignId_key"
ON "LoyaltyRewardRedemption"("couponCampaignId");
CREATE INDEX "LoyaltyRewardRedemption_customerEmail_createdAt_idx"
ON "LoyaltyRewardRedemption"("customerEmail", "createdAt");
CREATE INDEX "LoyaltyRewardRedemption_rewardId_createdAt_idx"
ON "LoyaltyRewardRedemption"("rewardId", "createdAt");
CREATE UNIQUE INDEX "LoyaltyPointEntry_rewardRedemptionId_key"
ON "LoyaltyPointEntry"("rewardRedemptionId");
CREATE INDEX "LoyaltyPointEntry_customerEmail_createdAt_idx"
ON "LoyaltyPointEntry"("customerEmail", "createdAt");
CREATE INDEX "LoyaltyPointEntry_customerEmail_expiresAt_idx"
ON "LoyaltyPointEntry"("customerEmail", "expiresAt");
CREATE INDEX "LoyaltyPointEntry_sourceOrderId_idx"
ON "LoyaltyPointEntry"("sourceOrderId");
CREATE UNIQUE INDEX "LoyaltyPointAllocation_redemptionEntryId_awardEntryId_key"
ON "LoyaltyPointAllocation"("redemptionEntryId", "awardEntryId");
CREATE INDEX "LoyaltyPointAllocation_awardEntryId_idx"
ON "LoyaltyPointAllocation"("awardEntryId");

ALTER TABLE "LoyaltyMissionProgress"
ADD CONSTRAINT "LoyaltyMissionProgress_missionId_fkey"
FOREIGN KEY ("missionId") REFERENCES "LoyaltyMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoyaltyMissionContribution"
ADD CONSTRAINT "LoyaltyMissionContribution_missionId_fkey"
FOREIGN KEY ("missionId") REFERENCES "LoyaltyMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMissionContribution"
ADD CONSTRAINT "LoyaltyMissionContribution_progressId_fkey"
FOREIGN KEY ("progressId") REFERENCES "LoyaltyMissionProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyMissionContribution"
ADD CONSTRAINT "LoyaltyMissionContribution_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoyaltyRewardRedemption"
ADD CONSTRAINT "LoyaltyRewardRedemption_rewardId_fkey"
FOREIGN KEY ("rewardId") REFERENCES "LoyaltyReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LoyaltyRewardRedemption"
ADD CONSTRAINT "LoyaltyRewardRedemption_couponCampaignId_fkey"
FOREIGN KEY ("couponCampaignId") REFERENCES "CouponCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LoyaltyPointEntry"
ADD CONSTRAINT "LoyaltyPointEntry_missionId_fkey"
FOREIGN KEY ("missionId") REFERENCES "LoyaltyMission"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPointEntry"
ADD CONSTRAINT "LoyaltyPointEntry_progressId_fkey"
FOREIGN KEY ("progressId") REFERENCES "LoyaltyMissionProgress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPointEntry"
ADD CONSTRAINT "LoyaltyPointEntry_sourceOrderId_fkey"
FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPointEntry"
ADD CONSTRAINT "LoyaltyPointEntry_rewardRedemptionId_fkey"
FOREIGN KEY ("rewardRedemptionId") REFERENCES "LoyaltyRewardRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoyaltyPointAllocation"
ADD CONSTRAINT "LoyaltyPointAllocation_redemptionEntryId_fkey"
FOREIGN KEY ("redemptionEntryId") REFERENCES "LoyaltyPointEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoyaltyPointAllocation"
ADD CONSTRAINT "LoyaltyPointAllocation_awardEntryId_fkey"
FOREIGN KEY ("awardEntryId") REFERENCES "LoyaltyPointEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
