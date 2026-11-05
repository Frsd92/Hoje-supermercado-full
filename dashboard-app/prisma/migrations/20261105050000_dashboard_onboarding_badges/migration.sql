ALTER TABLE "CustomerProfile"
ADD COLUMN "dismissedDashboardBadges" JSONB NOT NULL DEFAULT '[]'::JSONB;
