CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "issuerTaxId" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "recipientTaxId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "protocolNumber" TEXT,
    "protocolStatus" TEXT,
    "authorizationDataComplete" BOOLEAN NOT NULL DEFAULT false,
    "total" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Em Análise',
    "supplierId" TEXT,
    "purchaseOrderId" TEXT,
    "xmlData" BYTEA NOT NULL,
    "danfeData" BYTEA,
    "danfeFileName" TEXT,
    "importedBy" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedBy" TEXT,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "supplierProductCode" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ncm" TEXT NOT NULL,
    "cfop" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "invoiceQuantity" DECIMAL(16,6) NOT NULL,
    "invoiceLots" JSONB NOT NULL DEFAULT '[]',
    "unitPrice" DECIMAL(16,6) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "productId" TEXT,
    "acceptedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "missingQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "damagedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "approvedUnitCost" DECIMAL(12,2),
    "lotCode" TEXT,
    "expiry" DATE,
    "manufactureDate" DATE,
    "discrepancyNote" TEXT,

    CONSTRAINT "SupplierInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoiceReceiptLot" (
    "id" TEXT NOT NULL,
    "invoiceItemId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "lotCode" TEXT,
    "expiry" DATE,
    "manufactureDate" DATE,
    "location" TEXT,

    CONSTRAINT "SupplierInvoiceReceiptLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPayable" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "installment" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "dueAt" DATE,
    "status" TEXT NOT NULL DEFAULT 'Em Análise',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoiceAuditLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB,
    "changes" JSONB,
    "note" TEXT,

    CONSTRAINT "SupplierInvoiceAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierInvoice_accessKey_key" ON "SupplierInvoice"("accessKey");
CREATE INDEX "SupplierInvoice_status_issuedAt_idx" ON "SupplierInvoice"("status", "issuedAt");
CREATE INDEX "SupplierInvoice_supplierId_issuedAt_idx" ON "SupplierInvoice"("supplierId", "issuedAt");
CREATE INDEX "SupplierInvoice_purchaseOrderId_idx" ON "SupplierInvoice"("purchaseOrderId");
CREATE UNIQUE INDEX "SupplierInvoiceItem_invoiceId_lineNumber_key" ON "SupplierInvoiceItem"("invoiceId", "lineNumber");
CREATE INDEX "SupplierInvoiceItem_productId_idx" ON "SupplierInvoiceItem"("productId");
CREATE INDEX "SupplierInvoiceReceiptLot_invoiceItemId_idx" ON "SupplierInvoiceReceiptLot"("invoiceItemId");
CREATE UNIQUE INDEX "SupplierPayable_invoiceId_installment_key" ON "SupplierPayable"("invoiceId", "installment");
CREATE INDEX "SupplierPayable_status_dueAt_idx" ON "SupplierPayable"("status", "dueAt");
CREATE INDEX "SupplierPayable_invoiceId_idx" ON "SupplierPayable"("invoiceId");
CREATE INDEX "SupplierInvoiceAuditLog_invoiceId_occurredAt_idx" ON "SupplierInvoiceAuditLog"("invoiceId", "occurredAt");

ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceReceiptLot" ADD CONSTRAINT "SupplierInvoiceReceiptLot_invoiceItemId_fkey"
    FOREIGN KEY ("invoiceItemId") REFERENCES "SupplierInvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceAuditLog" ADD CONSTRAINT "SupplierInvoiceAuditLog_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
