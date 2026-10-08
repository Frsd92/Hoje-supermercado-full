ALTER TABLE "StorePresenceSession"
ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "browser" TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE "StoreTrafficSnapshot"
ADD COLUMN "deviceCounts" JSONB,
ADD COLUMN "browserCounts" JSONB;
