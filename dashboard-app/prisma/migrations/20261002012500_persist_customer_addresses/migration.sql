CREATE TABLE "CustomerAddressBook" (
  "email" TEXT NOT NULL,
  "addresses" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAddressBook_pkey" PRIMARY KEY ("email")
);
