CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL,
  "identityName" TEXT NOT NULL,
  "identityTaxId" TEXT,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "taxId" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'Em Análise',
  "statusReason" TEXT,
  "contactName" TEXT,
  "contactRole" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "financeContact" TEXT,
  "financeEmail" TEXT,
  "financePhone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "paymentTerms" TEXT,
  "minimumOrderValue" DECIMAL(12,2),
  "deliveryTerms" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_identityName_key"
  ON "Supplier" ("identityName");
CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_identityTaxId_key"
  ON "Supplier" ("identityTaxId");
CREATE INDEX IF NOT EXISTS "Supplier_status_name_idx"
  ON "Supplier" ("status", "name");

CREATE TABLE IF NOT EXISTS "SupplierAuditLog" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB,
  "changes" JSONB,
  "note" TEXT,
  CONSTRAINT "SupplierAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierAuditLog_supplierId_fkey" FOREIGN KEY ("supplierId")
    REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupplierAuditLog_supplierId_occurredAt_idx"
  ON "SupplierAuditLog" ("supplierId", "occurredAt");

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Rascunho',
  "orderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expectedDelivery" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "notes" TEXT,
  "total" DECIMAL(14,2) NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId")
    REFERENCES "Supplier" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "receivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "receivedUnitCost" DECIMAL(12,2),
  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId")
    REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "PurchaseOrderAuditLog" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "snapshot" JSONB,
  "changes" JSONB,
  "note" TEXT,
  CONSTRAINT "PurchaseOrderAuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseOrderAuditLog_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId")
    REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrder_code_key"
  ON "PurchaseOrder" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseOrderItem_purchaseOrderId_productId_key"
  ON "PurchaseOrderItem" ("purchaseOrderId", "productId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_expectedDelivery_idx"
  ON "PurchaseOrder" ("status", "expectedDelivery");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_orderedAt_idx"
  ON "PurchaseOrder" ("orderedAt");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_orderedAt_idx"
  ON "PurchaseOrder" ("supplierId", "orderedAt");
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_productId_idx"
  ON "PurchaseOrderItem" ("productId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderAuditLog_purchaseOrderId_occurredAt_idx"
  ON "PurchaseOrderAuditLog" ("purchaseOrderId", "occurredAt");
