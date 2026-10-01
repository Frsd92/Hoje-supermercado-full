CREATE TABLE IF NOT EXISTS "CustomerCart" (
  "email" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCart_pkey" PRIMARY KEY ("email")
);

CREATE INDEX IF NOT EXISTS "CustomerCart_updatedAt_idx" ON "CustomerCart"("updatedAt");
