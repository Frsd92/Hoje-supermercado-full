CREATE TABLE IF NOT EXISTS "GuestCart" (
  "id" TEXT NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestCart_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GuestCart_updatedAt_idx"
  ON "GuestCart" ("updatedAt");
