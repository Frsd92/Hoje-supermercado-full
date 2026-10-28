CREATE TABLE "CompanyServiceSubscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "plan" TEXT,
    "accountEmail" TEXT,
    "managementUrl" TEXT,
    "paymentMethod" TEXT,
    "billingCycle" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "nextDueAt" DATE NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "CompanyServiceSubscription_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CompanyExpense"
    ADD COLUMN "serviceSubscriptionId" TEXT,
    ADD COLUMN "subscriptionPeriod" TEXT;

CREATE TABLE "CompanyServiceSubscriptionAuditLog" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,

    CONSTRAINT "CompanyServiceSubscriptionAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CompanyServiceSubscription_active_nextDueAt_idx" ON "CompanyServiceSubscription"("active", "nextDueAt");
CREATE INDEX "CompanyServiceSubscription_categoryId_idx" ON "CompanyServiceSubscription"("categoryId");
CREATE UNIQUE INDEX "CompanyExpense_serviceSubscriptionId_subscriptionPeriod_key" ON "CompanyExpense"("serviceSubscriptionId", "subscriptionPeriod");
CREATE INDEX "CompanyServiceSubscriptionAuditLog_subscriptionId_occurredAt_idx" ON "CompanyServiceSubscriptionAuditLog"("subscriptionId", "occurredAt");

ALTER TABLE "CompanyServiceSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyServiceSubscriptionAuditLog" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "CompanyServiceSubscription" ADD CONSTRAINT "CompanyServiceSubscription_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "FinancialChartAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyExpense" ADD CONSTRAINT "CompanyExpense_serviceSubscriptionId_fkey"
    FOREIGN KEY ("serviceSubscriptionId") REFERENCES "CompanyServiceSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CompanyServiceSubscriptionAuditLog" ADD CONSTRAINT "CompanyServiceSubscriptionAuditLog_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "CompanyServiceSubscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

REVOKE ALL PRIVILEGES ON TABLE "CompanyServiceSubscription", "CompanyServiceSubscriptionAuditLog"
FROM anon, authenticated;
