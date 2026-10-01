CREATE TABLE IF NOT EXISTS "CustomerAnnouncement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "audience" TEXT NOT NULL DEFAULT 'all',
  "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "type" TEXT NOT NULL DEFAULT 'promotion',
  "durationDays" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CustomerAnnouncement_expiresAt_idx" ON "CustomerAnnouncement"("expiresAt");
CREATE INDEX IF NOT EXISTS "CustomerAnnouncement_createdAt_idx" ON "CustomerAnnouncement"("createdAt");
