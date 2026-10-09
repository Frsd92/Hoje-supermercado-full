import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { parseShelfLifeDays } from './inventory-lots.js';

const productsFile = path.join(process.cwd(), 'data', 'products.json');

export async function readLegacyProducts() {
  try {
    const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

export function serializeProduct(record) {
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {};
  return {
    ...metadata,
    shelfLifeDays: parseShelfLifeDays(metadata.shelfLifeDays) || null,
    id: record.externalId || record.id,
    title: record.title,
    description: record.description || '',
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
    expiry: record.expiry?.toISOString() || '',
    categories: record.categories || [],
    createdBy: record.createdBy || '',
    createdAt: record.createdAt?.toISOString() || null,
    updatedAt: record.updatedAt?.toISOString() || null,
  };
}

export async function getProductCatalog(client = prisma) {
  let databaseProducts = [];
  try {
    databaseProducts = (await client.product.findMany()).map(serializeProduct);
  } catch (error) {
    console.error('Não foi possível carregar o catálogo persistido:', error);
  }

  const legacyProducts = await readLegacyProducts();
  const productsById = new Map(legacyProducts.map((product) => [String(product.id), product]));
  databaseProducts.forEach((product) => productsById.set(String(product.id), product));
  return [...productsById.values()];
}
