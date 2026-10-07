ALTER TABLE "CustomerProfile"
  ADD COLUMN "pagarmeCustomerId" TEXT,
  ADD COLUMN "pagarmeCardId" TEXT,
  ADD COLUMN "pagarmeCardBrand" TEXT,
  ADD COLUMN "pagarmeCardLastFourDigits" TEXT,
  ADD COLUMN "pagarmeCardExpMonth" INTEGER,
  ADD COLUMN "pagarmeCardExpYear" INTEGER;

CREATE UNIQUE INDEX "CustomerProfile_pagarmeCustomerId_key"
  ON "CustomerProfile"("pagarmeCustomerId");

CREATE UNIQUE INDEX "CustomerProfile_pagarmeCardId_key"
  ON "CustomerProfile"("pagarmeCardId");
