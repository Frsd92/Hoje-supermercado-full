CREATE TABLE IF NOT EXISTS "CustomerProfile" (
  "email" TEXT NOT NULL,
  "fullName" TEXT,
  "whatsapp" TEXT NOT NULL DEFAULT '',
  "cpf" TEXT NOT NULL DEFAULT '',
  "photo" TEXT,
  "monthlyBudget" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "memberSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerProfile_pkey" PRIMARY KEY ("email")
);
