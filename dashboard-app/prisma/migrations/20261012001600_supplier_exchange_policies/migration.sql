ALTER TABLE "Supplier"
ADD COLUMN "acceptsExpiredProductExchange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "acceptsDamagedProductExchange" BOOLEAN NOT NULL DEFAULT false;
