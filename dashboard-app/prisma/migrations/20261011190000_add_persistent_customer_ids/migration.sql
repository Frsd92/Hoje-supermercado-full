ALTER TABLE "CustomerProfile"
ADD COLUMN IF NOT EXISTS "customerId" TEXT;

UPDATE "CustomerProfile"
SET "customerId" = replace(gen_random_uuid()::TEXT, '-', '')
WHERE "customerId" IS NULL;

ALTER TABLE "CustomerProfile"
ALTER COLUMN "customerId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfile_customerId_key"
ON "CustomerProfile"("customerId");

WITH customer_emails AS (
  SELECT lower(btrim("email")) AS email, "createdAt" AS first_seen_at FROM "User"
  UNION
  SELECT lower(btrim("email")), "updatedAt" FROM "CustomerCart"
  UNION
  SELECT lower(btrim("customerEmail")), "createdAt" FROM "Order" WHERE "customerEmail" IS NOT NULL
  UNION
  SELECT lower(btrim(recipient."email")), campaign."createdAt"
  FROM "CouponRecipient" recipient
  JOIN "CouponCampaign" campaign ON campaign."id" = recipient."campaignId"
  UNION
  SELECT lower(btrim("email")), "createdAt" FROM "CouponRedemption"
  UNION
  SELECT lower(btrim("customerEmail")), "createdAt" FROM "LoyaltyMissionProgress"
),
customer_first_seen AS (
  SELECT email, min(first_seen_at) AS first_seen_at
  FROM customer_emails
  GROUP BY email
)
INSERT INTO "CustomerProfile" ("email", "customerId", "memberSince", "updatedAt")
SELECT email, replace(gen_random_uuid()::TEXT, '-', ''), first_seen_at, CURRENT_TIMESTAMP
FROM customer_first_seen
WHERE email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  AND NOT EXISTS (
    SELECT 1
    FROM "CustomerProfile" profile
    WHERE lower(btrim(profile."email")) = customer_first_seen.email
  )
ON CONFLICT ("email") DO NOTHING;
