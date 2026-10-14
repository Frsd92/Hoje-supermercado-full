CREATE TABLE "FinancialChartAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" TEXT NOT NULL DEFAULT 'EXPENSE',
    "expenseBehavior" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialChartAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyFinancialAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT,
    "accountType" TEXT NOT NULL,
    "openingBalance" DECIMAL(14,2) NOT NULL,
    "balanceAsOf" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyExpense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "competenceAt" DATE NOT NULL,
    "dueAt" DATE,
    "status" TEXT NOT NULL DEFAULT 'Em aberto',
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyExpense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyExpenseAuditLog" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,
    "note" TEXT,

    CONSTRAINT "CompanyExpenseAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialChartAccount_code_key" ON "FinancialChartAccount"("code");
CREATE INDEX "FinancialChartAccount_active_nature_idx" ON "FinancialChartAccount"("active", "nature");
CREATE INDEX "CompanyFinancialAccount_active_accountType_idx" ON "CompanyFinancialAccount"("active", "accountType");
CREATE INDEX "CompanyExpense_status_dueAt_idx" ON "CompanyExpense"("status", "dueAt");
CREATE INDEX "CompanyExpense_competenceAt_status_idx" ON "CompanyExpense"("competenceAt", "status");
CREATE INDEX "CompanyExpense_categoryId_idx" ON "CompanyExpense"("categoryId");
CREATE INDEX "CompanyExpense_financialAccountId_idx" ON "CompanyExpense"("financialAccountId");
CREATE INDEX "CompanyExpenseAuditLog_expenseId_occurredAt_idx" ON "CompanyExpenseAuditLog"("expenseId", "occurredAt");

ALTER TABLE "FinancialChartAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyFinancialAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyExpense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyExpenseAuditLog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "FinancialChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_financialAccountId_fkey"
    FOREIGN KEY ("financialAccountId") REFERENCES "CompanyFinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyExpenseAuditLog" ADD CONSTRAINT "CompanyExpenseAuditLog_expenseId_fkey"
    FOREIGN KEY ("expenseId") REFERENCES "CompanyExpense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL PRIVILEGES ON TABLE
    "FinancialChartAccount",
    "CompanyFinancialAccount",
    "CompanyExpense",
    "CompanyExpenseAuditLog"
FROM anon, authenticated;
