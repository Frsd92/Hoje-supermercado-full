import { readFile } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { productAuditSnapshot, productIdentityKeys } from '../features/erp/api/product-audit.js';

dotenv.config({ path: '.env.local' });
dotenv.config();
const { prisma } = await import('../lib/prisma.js');
const productFile = path.join(process.cwd(), 'data', 'products.json');
const sourceProducts = JSON.parse(await readFile(productFile, 'utf8'));
if (!Array.isArray(sourceProducts)) throw new Error('data/products.json precisa conter uma lista de produtos.');

const records = await prisma.product.findMany();
const legacyById = new Map(sourceProducts.map((product) => [String(product.id), product]));
const claimedTitles = new Map();
const claimedSkus = new Map();
const claimedBarcodes = new Map();
const plans = records.map((record) => {
  const legacy = legacyById.get(String(record.externalId || record.id));
  const product = legacy || {
    ...(record.metadata || {}),
    id: record.externalId || record.id,
    title: record.title,
    description: record.description,
    price: Number(record.price),
    cost: Number(record.cost),
    discount: Number(record.discount),
    quantity: Number(record.quantity),
    sku: record.sku || '',
    barcode: record.barcode || '',
    brand: record.brand || '',
    supplier: record.supplier || '',
    subcategory: record.subcategory || '',
    image: record.image || '',
    status: record.status,
    categories: record.categories || [],
    createdBy: record.createdBy || '',
    createdAt: record.createdAt?.toISOString() || null,
    updatedAt: record.updatedAt?.toISOString() || null,
  };
  const keys = productIdentityKeys(product);
  for (const [value, map, field] of [
    [keys.identityTitle, claimedTitles, 'nome'],
    [keys.identitySku, claimedSkus, 'SKU'],
    ...keys.normalizedBarcodes.map((barcode) => [barcode, claimedBarcodes, 'código de barras']),
  ]) {
    if (!value) continue;
    const previous = map.get(value);
    if (previous && previous !== record.id) {
      throw new Error(`Duplicidade existente no catálogo (${field} "${value}") entre os produtos ${previous} e ${record.id}. Nenhuma alteração foi feita.`);
    }
    map.set(value, record.id);
  }

  const createdAt = new Date(legacy?.createdAt || record.createdAt || Date.now());
  const sourceHistory = Array.isArray(product.priceHistory) ? product.priceHistory : [];
  const auditRows = [{
    id: `legacy-create-${record.id}`,
    productId: record.id,
    productExternalId: record.externalId,
    productTitle: record.title,
    action: 'LEGACY_BASELINE',
    actor: String(legacy?.createdBy || record.createdBy || 'Migração de auditoria'),
    occurredAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
    snapshot: productAuditSnapshot(product),
    changes: undefined,
    note: legacy
      ? 'Snapshot recuperado do catálogo legado. Não representa necessariamente todas as edições históricas.'
      : 'Snapshot do estado encontrado na migração. O histórico anterior de alterações não estava disponível.',
  }];
  sourceHistory.forEach((event, index) => {
    const occurredAt = new Date(event?.date || event?.createdAt || '');
    if (Number.isNaN(occurredAt.getTime())) return;
    auditRows.push({
      id: `legacy-price-${record.id}-${index}`,
      productId: record.id,
      productExternalId: record.externalId,
      productTitle: record.title,
      action: 'LEGACY_PRICE_HISTORY',
      actor: String(event?.changedBy || legacy?.createdBy || 'Histórico legado'),
      occurredAt,
      snapshot: productAuditSnapshot(event),
      changes: undefined,
      note: 'Registro recuperado do histórico de preços existente; não representa auditoria completa dos demais campos.',
    });
  });
  return { record, product, keys, auditRows };
});

const identityUpdates = plans.map(({ record, keys }) => prisma.product.update({
  where: { id: record.id },
  data: {
    identityTitle: keys.identityTitle,
    identitySku: keys.identitySku,
    identityBarcode: keys.identityBarcode,
  },
}));
for (let start = 0; start < identityUpdates.length; start += 50) {
  await prisma.$transaction(identityUpdates.slice(start, start + 50));
}

const barcodeRows = plans.flatMap(({ record, keys }) => keys.normalizedBarcodes.map((code) => ({
  id: `legacy-barcode-${record.id}-${Buffer.from(code).toString('base64url')}`,
  productId: record.id,
  code,
})));
for (let start = 0; start < barcodeRows.length; start += 500) {
  await prisma.productBarcode.createMany({ data: barcodeRows.slice(start, start + 500), skipDuplicates: true });
}

const auditRows = plans.flatMap(({ auditRows: rows }) => rows);
for (let start = 0; start < auditRows.length; start += 500) {
  await prisma.productAuditLog.createMany({ data: auditRows.slice(start, start + 500), skipDuplicates: true });
}

console.log(`Identidades normalizadas: ${records.length} produtos.`);
console.log(`Códigos de barras vinculados: ${barcodeRows.length}.`);
console.log(`Registros legados de auditoria/preço: ${auditRows.length}.`);
await prisma.$disconnect();
