import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '../../../lib/prisma.js';
import { parseShelfLifeDays } from './inventory-lots.js';
import { publicProductImage } from './product-image-url.js';
import { normalizeProductMainCategories } from '../product-organization.js';
import { serializePublicProductRecord } from './public-product-record.js';

const productsFile = path.join(process.cwd(), 'data', 'products.json');

export async function readLegacyProducts({ strict = false } = {}) {
  try {
    const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(products)
      ? products.map((product) => ({
        ...product,
        categories: normalizeProductMainCategories(product.categories),
      }))
      : [];
  } catch (error) {
    if (strict) throw error;
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
    barcodes: Array.isArray(record.productBarcodes) && record.productBarcodes.length
      ? record.productBarcodes.map(({ code }) => code)
      : Array.isArray(metadata.barcodes) ? metadata.barcodes : record.barcode ? [record.barcode] : [],
    brand: record.brand || '',
    supplier: record.supplier || '',
    subcategory: record.subcategory || '',
    image: record.image || '',
    status: record.status,
    blingProductId: record.blingProductId || '',
    blingSyncStatus: record.blingSyncStatus || 'not_synced',
    blingSyncError: record.blingSyncError || '',
    blingSyncedAt: record.blingSyncedAt?.toISOString() || null,
    blingSyncVerifiedData: record.blingSyncVerifiedData || null,
    expiry: record.expiry?.toISOString() || '',
    categories: normalizeProductMainCategories(record.categories),
    createdBy: record.createdBy || '',
    createdAt: record.createdAt?.toISOString() || null,
    updatedAt: record.updatedAt?.toISOString() || null,
  };
}

export function serializeErpProductListRecord(record) {
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {};
  const product = {
    id: record.externalId || record.id,
    title: record.title,
    price: Number(record.price),
    cost: Number(record.cost),
    quantity: Number(record.quantity),
    sku: record.sku || '',
    barcode: record.barcode || '',
    barcodes: Array.isArray(metadata.barcodes) ? metadata.barcodes : record.barcode ? [record.barcode] : [],
    brand: record.brand || '',
    subcategory: record.subcategory || '',
    saleUnit: metadata.saleUnit || record.saleUnit || '',
    image: record.image || '',
    imageHash: record.imageHash || '',
    status: record.status,
    blingSyncStatus: record.blingSyncStatus || 'not_synced',
    blingSyncError: record.blingSyncError || '',
    blingSyncVerifiedData: record.blingSyncVerifiedData || null,
    categories: normalizeProductMainCategories(record.categories),
  };
  product.image = publicProductImage(product);
  delete product.imageHash;
  return product;
}

export async function getProductById(id, client = prisma) {
  const productId = String(id || '').trim();
  if (!productId) return null;

  const record = await client.product.findFirst({
    where: { OR: [{ externalId: productId }, { id: productId }] },
    include: { productBarcodes: { select: { code: true } } },
  });
  if (record) return serializeProduct(record);

  const legacyProducts = await readLegacyProducts();
  return legacyProducts.find((product) => String(product.id) === productId) || null;
}

export async function getErpProductList(client = prisma) {
  const records = await client.$queryRaw`
    SELECT
      "id",
      "externalId",
      "title",
      "price",
      "cost",
      "quantity",
      "sku",
      "barcode",
      "brand",
      "subcategory",
      "status",
      "categories",
      "metadata",
      "blingSyncStatus",
      "blingSyncError",
      "blingSyncVerifiedData",
      CASE
        WHEN "image" ~* '^data:image/(png|jpeg|webp);base64,' THEN ''
        ELSE COALESCE("image", '')
      END AS "image",
      CASE
        WHEN "image" ~* '^data:image/(png|jpeg|webp);base64,' THEN MD5("image")
        ELSE ''
      END AS "imageHash"
    FROM "Product"
    ORDER BY "title" ASC
  `;
  const legacyProducts = await readLegacyProducts();
  const productsById = new Map(legacyProducts.map((product) => {
    const listProduct = serializeErpProductListRecord({
      ...product,
      externalId: product.id,
      categories: normalizeProductMainCategories(product.categories),
      metadata: {
        barcodes: product.barcodes,
        saleUnit: product.saleUnit,
      },
    });
    return [String(product.id), listProduct];
  }));
  records.map(serializeErpProductListRecord).forEach((product) => productsById.set(String(product.id), product));
  return [...productsById.values()];
}

export async function getProductCatalog(client = prisma, { strict = false } = {}) {
  let databaseProducts = [];
  try {
    databaseProducts = (await client.product.findMany()).map(serializeProduct);
  } catch (error) {
    if (strict) throw error;
    console.error('Não foi possível carregar o catálogo persistido:', error);
  }

  const legacyProducts = await readLegacyProducts({ strict });
  const productsById = new Map(legacyProducts.map((product) => [String(product.id), product]));
  databaseProducts.forEach((product) => productsById.set(String(product.id), product));
  return [...productsById.values()];
}

export async function getPublicProductCatalog(client = prisma) {
  let databaseProducts = [];
  try {
    const records = await client.$queryRaw`
      SELECT
        "id",
        "externalId",
        "title",
        "description",
        "price",
        "discount",
        "status",
        "categories",
        "brand",
        "subcategory",
        "metadata",
        CASE
          WHEN "image" ~* '^data:image/(png|jpeg|webp);base64,' THEN ''
          ELSE COALESCE("image", '')
        END AS "image",
        CASE
          WHEN "image" ~* '^data:image/(png|jpeg|webp);base64,' THEN MD5("image")
          ELSE ''
        END AS "imageHash"
      FROM "Product"
      WHERE "status" = 'Ativo'
    `;
    databaseProducts = records.map(serializePublicProductRecord);
  } catch (error) {
    console.error('Não foi possível carregar o catálogo público persistido:', error);
  }

  const legacyProducts = (await readLegacyProducts()).map((product) => ({
    ...product,
    categories: normalizeProductMainCategories(product.categories),
  }));
  const productsById = new Map(legacyProducts.map((product) => [String(product.id), product]));
  databaseProducts.forEach((product) => productsById.set(String(product.id), product));
  return [...productsById.values()];
}

export async function getPublicProductsByIds(ids, client = prisma) {
  const productIds = [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean))];
  if (!productIds.length) return [];

  const records = await client.product.findMany({
    where: {
      OR: [{ id: { in: productIds } }, { externalId: { in: productIds } }],
    },
    select: {
      id: true,
      externalId: true,
      title: true,
      price: true,
      discount: true,
      status: true,
      metadata: true,
    },
  });
  const productsById = new Map();
  records
    .filter((record) => record.status === 'Ativo')
    .map(serializePublicProductRecord)
    .forEach((product) => {
      productsById.set(String(product.id), product);
    });

  const databaseIdentifiers = new Set(records.flatMap((record) => [
    String(record.id),
    String(record.externalId || ''),
  ]));
  const missingIds = productIds.filter((id) => !databaseIdentifiers.has(id));
  if (missingIds.length) {
    const requestedIds = new Set(missingIds);
    const legacyProducts = await readLegacyProducts();
    legacyProducts
      .filter((product) => requestedIds.has(String(product.id)) && product.status === 'Ativo')
      .forEach((product) => productsById.set(String(product.id), product));
  }

  return [...productsById.values()];
}
