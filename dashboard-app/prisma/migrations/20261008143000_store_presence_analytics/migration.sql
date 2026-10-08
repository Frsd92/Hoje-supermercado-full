CREATE TABLE "StorePresenceSession" (
    "id" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorePresenceSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StorePresenceSession_lastSeenAt_idx" ON "StorePresenceSession"("lastSeenAt");

CREATE TABLE "StoreTrafficSnapshot" (
    "minute" TIMESTAMP(3) NOT NULL,
    "onlineVisitors" INTEGER NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreTrafficSnapshot_pkey" PRIMARY KEY ("minute")
);
