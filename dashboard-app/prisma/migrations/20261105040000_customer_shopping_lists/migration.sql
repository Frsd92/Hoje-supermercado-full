CREATE TABLE "CustomerShoppingList" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" VARCHAR(60) NOT NULL,
  "items" JSONB NOT NULL DEFAULT '[]'::JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerShoppingList_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerShoppingList_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CustomerShoppingList_userId_updatedAt_idx"
  ON "CustomerShoppingList"("userId", "updatedAt");
