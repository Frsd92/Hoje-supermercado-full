import { promises as fs } from 'fs';
import { createHash } from 'node:crypto';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { appendPriceHistory } from '@/features/erp/api/price-history';
import { calculateSalePrice } from '@/features/erp/api/product-pricing';
import { findProductIdentityConflict, getProductAuditChanges, productAuditSnapshot, productIdentityKeys } from '@/features/erp/api/product-audit';
import {
  addInventoryLot,
  inventoryDateOnly,
  inventoryQuantityMilliUnits,
  parseInventoryDate,
  parseShelfLifeDays,
  resolveInventoryExpiry,
  requiresInventoryExpiry,
} from '@/features/erp/api/inventory-lots';
import { getProductOrganizationError } from '@/features/erp/product-organization';
import { prisma } from '@/lib/prisma';

const productsFile = path.join(process.cwd(), 'data', 'products.json');
const ordersFile = path.join(process.cwd(), 'data', 'orders.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);
const privateProductFields = new Set([
  'cost',
  'priceHistory',
  'createdBy',
  'updatedBy',
  'profitMarginPercent',
  'profitMarginValue',
  'markupPercent',
  'shelfLifeDays',
  'expiryMode',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  };
}

async function readProducts() {
  try {
    const products = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    return Array.isArray(products) ? products : [];
  } catch {
    return [];
  }
}

function serializeProduct(record) {
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

function productMetadata(product) {
  const metadata = { ...product };
  for (const field of [
    'id', 'title', 'description', 'price', 'cost', 'discount', 'quantity',
    'sku', 'barcode', 'brand', 'supplier', 'subcategory', 'image', 'status',
    'expiry', 'expiryMode', 'categories', 'createdBy', 'createdAt', 'updatedAt',
  ]) delete metadata[field];
  return metadata;
}

function productDatabaseData(product) {
  const expiry = product.expiry ? new Date(product.expiry) : null;
  const identity = productIdentityKeys(product);
  const metadata = productMetadata(product);
  metadata.shelfLifeDays = parseShelfLifeDays(product.shelfLifeDays);
  return {
    identityTitle: identity.identityTitle,
    identitySku: identity.identitySku,
    identityBarcode: identity.identityBarcode,
    title: String(product.title || '').trim(),
    description: String(product.description || ''),
    price: Number(product.price),
    cost: Number(product.cost) || 0,
    discount: Number(product.discount) || 0,
    quantity: Number(product.quantity) || 0,
    sku: product.sku ? String(product.sku) : null,
    barcode: product.barcode ? String(product.barcode) : null,
    brand: product.brand ? String(product.brand) : null,
    supplier: product.supplier ? String(product.supplier) : null,
    subcategory: product.subcategory ? String(product.subcategory) : null,
    image: product.image ? String(product.image) : null,
    status: product.status || 'Ativo',
    expiry: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
    categories: Array.isArray(product.categories) ? product.categories : [],
    createdBy: product.createdBy ? String(product.createdBy) : null,
    metadata,
  };
}

async function getProducts() {
  let databaseProducts = [];
  try {
    databaseProducts = (await prisma.product.findMany()).map(serializeProduct);
  } catch (error) {
    console.error('Não foi possível carregar o catálogo persistido:', error);
  }

  const legacyProducts = await readProducts();
  const productsById = new Map(legacyProducts.map((product) => [String(product.id), product]));
  databaseProducts.forEach((product) => productsById.set(String(product.id), product));
  return [...productsById.values()];
}

class DuplicateProductError extends Error {
  constructor(productTitle, field) {
    super(`Já existe um produto com ${field}: "${productTitle}". Abra o produto existente para editá-lo.`);
    this.name = 'DuplicateProductError';
    this.status = 409;
  }
}

class InventoryQuantityMismatchError extends Error {
  constructor(message = 'A quantidade exibida é o saldo total dos lotes. Ajuste estoque e validade em ERP → Validade.') {
    super(message);
    this.name = 'InventoryQuantityMismatchError';
  }
}

function matchingDuplicate(product, products, excludedId = '') {
  const conflict = findProductIdentityConflict(product, products, excludedId);
  return conflict ? new DuplicateProductError(conflict.product.title, conflict.field) : null;
}

async function saveProduct(product, { actor, action, before = null }) {
  const externalId = String(product.id || '').trim();
  const data = productDatabaseData(product);
  const keys = productIdentityKeys(product);
  return prisma.$transaction(async (transaction) => {
    const existing = externalId
      ? await transaction.product.findFirst({ where: { OR: [{ externalId }, { id: externalId }] } })
      : null;
    if (existing) {
      const submittedQuantity = inventoryQuantityMilliUnits(product.quantity);
      const currentQuantity = inventoryQuantityMilliUnits(existing.quantity);
      if (submittedQuantity === null || submittedQuantity !== currentQuantity) {
        throw new InventoryQuantityMismatchError();
      }
      const currentMetadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
        ? existing.metadata
        : {};
      const nextMetadata = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
        ? data.metadata
        : {};
      data.quantity = existing.quantity;
      data.expiry = existing.expiry;
      data.metadata = {
        ...nextMetadata,
        lot: currentMetadata.lot || '',
        manufactureDate: currentMetadata.manufactureDate || '',
      };
      if (Number(existing.quantity) > 0 && currentMetadata.saleUnit !== nextMetadata.saleUnit) {
        throw new InventoryQuantityMismatchError('Não é possível alterar a unidade de venda enquanto houver saldo em lotes. Zere ou ajuste o estoque antes de trocar a unidade.');
      }
    }

    const auditBefore = existing ? serializeProduct(existing) : before;
    const excludedId = existing?.id;
    const conditions = [
      { identityTitle: keys.identityTitle },
      ...(keys.identitySku ? [{ identitySku: keys.identitySku }] : []),
    ];
    const duplicate = await transaction.product.findFirst({
      where: {
        OR: conditions,
        ...(excludedId ? { id: { not: excludedId } } : {}),
      },
    });
    if (duplicate) {
      const field = duplicate.identityTitle === keys.identityTitle ? 'este nome' : 'este SKU';
      throw new DuplicateProductError(duplicate.title, field);
    }
    const barcodeDuplicate = keys.normalizedBarcodes.length
      ? await transaction.productBarcode.findFirst({
        where: { code: { in: keys.normalizedBarcodes }, ...(excludedId ? { productId: { not: excludedId } } : {}) },
        include: { product: { select: { title: true } } },
      })
      : null;
    if (barcodeDuplicate) throw new DuplicateProductError(barcodeDuplicate.product.title, 'este código de barras');

    let saved = existing
      ? await transaction.product.update({ where: { id: existing.id }, data })
      : await transaction.product.create({ data: { ...data, externalId: externalId || undefined } });
    if (!existing && Number(data.quantity) > 0) {
      const initialLot = await addInventoryLot(transaction, {
        productId: saved.id,
        lotCode: product.lot,
        quantity: data.quantity,
        expiry: product.expiry,
        manufactureDate: product.manufactureDate,
        shelfLifeDays: product.expiryMode === 'days' ? product.shelfLifeDays : null,
        location: product.location,
        actor,
        source: 'OPENING_STOCK',
        sourceReference: 'product-registration',
      });
      saved = initialLot.product;
    } else if (!existing) {
      saved = await transaction.product.update({
        where: { id: saved.id },
        data: {
          expiry: null,
          metadata: { ...data.metadata, lot: '', manufactureDate: '' },
        },
      });
    }
    await transaction.productBarcode.deleteMany({ where: { productId: saved.id } });
    if (keys.normalizedBarcodes.length) {
      await transaction.productBarcode.createMany({
        data: keys.normalizedBarcodes.map((code) => ({
          productId: saved.id,
          code,
        })),
      });
    }
    const auditedProduct = { ...serializeProduct(saved), id: product.id || saved.id };
    const changes = auditBefore
      ? getProductAuditChanges(auditBefore, auditedProduct)
      : undefined;
    await transaction.productAuditLog.create({
      data: {
        productId: saved.id,
        productExternalId: saved.externalId,
        productTitle: saved.title,
        action,
        actor,
        snapshot: auditBefore ? undefined : productAuditSnapshot(auditedProduct),
        changes,
      },
    });
    return saved;
  });
}

async function deleteProduct(id, actor) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.product.findFirst({ where: { OR: [{ externalId: id }, { id }] } });
    if (!existing) return { deleted: false };
    const inventoryLots = await transaction.productLot.count({ where: { productId: existing.id } });
    if (inventoryLots) {
      return { deleted: false, error: 'Este produto possui histórico de lotes de estoque e não pode ser excluído. Altere o status para Arquivado.' };
    }
    const snapshot = serializeProduct(existing);
    await transaction.product.delete({ where: { id: existing.id } });
    await transaction.productAuditLog.create({
      data: {
        productId: existing.id,
        productExternalId: existing.externalId,
        productTitle: existing.title,
        action: 'DELETE',
        actor,
        snapshot: productAuditSnapshot(snapshot),
      },
    });
    return { deleted: true };
  });
}

async function readSales() {
  try {
    const orders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    return (Array.isArray(orders) ? orders : []).reduce((sales, order) => {
      (order.items || []).forEach((item) => {
        const key = String(item.productId || item.name || '').trim().toLowerCase();
        if (key) sales[key] = (sales[key] || 0) + (Number(item.quantity) || 0);
      });
      return sales;
    }, {});
  } catch {
    return {};
  }
}

function ensurePriceHistory(product) {
  return {
    ...product,
    priceHistory: Array.isArray(product.priceHistory) ? product.priceHistory : [],
  };
}

function publicProductImage(product) {
  const image = typeof product.image === 'string' ? product.image : '';
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) return image;

  const version = createHash('sha256').update(image).digest('hex').slice(0, 16);
  return `/api/products?purpose=image&id=${encodeURIComponent(product.id)}&v=${version}`;
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const purpose = searchParams.get('purpose');
  if (purpose === 'image') {
    const productId = searchParams.get('id');
    const version = searchParams.get('v');
    if (!productId || !version) {
      return Response.json({ error: 'Identificador ou versão da imagem ausente.' }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }

    let product = null;
    try {
      product = await prisma.product.findFirst({
        where: { OR: [{ externalId: productId }, { id: productId }] },
        select: { externalId: true, id: true, image: true, status: true },
      });
    } catch (error) {
      console.error('Não foi possível localizar a imagem no catálogo persistido:', error);
    }
    if (!product) {
      const legacyProducts = await readProducts();
      product = legacyProducts.find((item) => String(item.id) === productId) || null;
    }

    const image = typeof product?.image === 'string' ? product.image : '';
    const imageMatch = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image);
    const currentVersion = image
      ? createHash('sha256').update(image).digest('hex').slice(0, 16)
      : '';
    if (product?.status !== 'Ativo' || !imageMatch || currentVersion !== version) {
      return Response.json({ error: 'Imagem do produto não encontrada.' }, {
        status: 404,
        headers: corsHeaders(request),
      });
    }

    const imageBytes = Buffer.from(imageMatch[2], 'base64');
    if (!imageBytes.length || imageBytes.toString('base64') !== imageMatch[2]) {
      return Response.json({ error: 'Imagem do produto inválida.' }, {
        status: 404,
        headers: corsHeaders(request),
      });
    }
    return new Response(imageBytes, {
      headers: {
        ...corsHeaders(request),
        'Content-Type': imageMatch[1].toLowerCase(),
        'Content-Length': String(imageBytes.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const products = await getProducts();
  if (purpose === 'search') {
    const searchableProducts = products
      .filter((product) => product.status === 'Ativo')
      .map((product) => ({
        id: product.id,
        title: product.title,
        categories: Array.isArray(product.categories) ? product.categories : [],
        subcategory: product.subcategory || '',
        brand: product.brand || '',
        description: product.description || '',
        image: publicProductImage(product),
        price: Number(product.price) || 0,
        salePrice: calculateSalePrice(product),
        discount: Number(product.discount) || 0,
        saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
      }));
    return Response.json({ products: searchableProducts }, {
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  if (purpose === 'store') {
    const sales = await readSales();
    const storeProducts = products
      .filter((product) => product.status === 'Ativo')
      .map((product) => ({
        id: product.id,
        title: product.title,
        description: product.description || '',
        price: Number(product.price) || 0,
        salePrice: calculateSalePrice(product),
        discount: Number(product.discount) || 0,
        saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
        image: publicProductImage(product),
        categories: Array.isArray(product.categories) ? product.categories : [],
        department: product.department || '',
        subcategory: product.subcategory || '',
        brand: product.brand || '',
        productType: product.productType || '',
        collection: product.collection || '',
        featuredPriceTypes: Array.isArray(product.featuredPriceTypes) ? product.featuredPriceTypes : [],
        salesCount: sales[String(product.id).toLowerCase()] || sales[String(product.title).toLowerCase()] || 0,
      }));
    return Response.json({ products: storeProducts }, {
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  const session = await getServerSession(authOptions);
  const canViewPrivateFields = hasErpAccess(session?.user);
  const sales = await readSales();
  const visibleProducts = products.filter((product) => canViewPrivateFields || product.status === 'Ativo');
  const activeProducts = visibleProducts.map((product) => {
    const enrichedProduct = {
      ...ensurePriceHistory(product),
      salePrice: calculateSalePrice(product),
      salesCount: sales[String(product.id).toLowerCase()] || sales[String(product.title).toLowerCase()] || 0,
    };

    if (canViewPrivateFields) return enrichedProduct;

    return Object.fromEntries(
      Object.entries(enrichedProduct).filter(([field]) => !privateProductFields.has(field)),
    );
  });
  return Response.json({ products: activeProducts }, {
    headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const product = await request.json();
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const quantityMilliUnits = inventoryQuantityMilliUnits(product?.quantity ?? 0);
  const shelfLifeDays = parseShelfLifeDays(product?.shelfLifeDays);
  const expiryMode = product?.expiryMode || (shelfLifeDays ? 'days' : 'date');
  const categories = Array.isArray(product?.categories)
    ? [...new Set(product.categories.map((category) => String(category).trim()).filter(Boolean))]
    : [];
  const status = ['Ativo', 'Rascunho', 'Arquivado'].includes(product?.status) ? product.status : 'Ativo';
  if (!title || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isFinite(quantity) || quantity < 0 || quantityMilliUnits === null || !categories.length) return Response.json({ error: 'Informe nome, preço, custo, desconto válido, estoque com até três casas decimais e ao menos uma categoria.' }, { status: 400, headers: corsHeaders(request) });
  if (shelfLifeDays === undefined) return Response.json({ error: 'Informe um prazo de validade em dias entre 1 e 36.500.' }, { status: 400, headers: corsHeaders(request) });
  let initialLotDates = null;
  if (quantity > 0) {
    initialLotDates = resolveInventoryExpiry({
      expiryMode,
      expiry: product.expiry,
      manufactureDate: product.manufactureDate,
      shelfLifeDays,
    });
    if (initialLotDates.error) return Response.json({ error: initialLotDates.error }, { status: 400, headers: corsHeaders(request) });
    if (requiresInventoryExpiry(product) && !initialLotDates.expiry) return Response.json({ error: 'Informe a validade do lote inicial por data ou por prazo em dias.' }, { status: 400, headers: corsHeaders(request) });
  } else if (parseInventoryDate(product?.expiry) === undefined || parseInventoryDate(product?.manufactureDate) === undefined) {
    return Response.json({ error: 'Informe datas válidas para o lote inicial.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (quantity > 0 && product.controlsLot === true && !String(product.lot || '').trim()) return Response.json({ error: 'Informe o código do lote inicial para produtos que controlam lote.' }, { status: 400, headers: corsHeaders(request) });
  const organizationError = getProductOrganizationError({ ...product, categories });
  if (organizationError) return Response.json({ error: organizationError }, { status: 400, headers: corsHeaders(request) });

  const savedProduct = {
    ...product,
    title,
    price,
    cost,
    discount,
    quantity,
    categories,
    department: String(product?.department || '').trim(),
    subcategory: String(product?.subcategory || '').trim(),
    status,
    shelfLifeDays,
    expiryMode,
    id: `PROD-${Date.now()}`,
    createdAt: new Date().toISOString(),
    createdBy: actor,
    priceHistory: [{
      date: new Date().toISOString(),
      price,
      cost,
      discount,
      changedBy: actor,
    }],
  };
  if (quantity === 0) {
    savedProduct.expiry = '';
    savedProduct.lot = '';
    savedProduct.manufactureDate = '';
  } else {
    savedProduct.expiry = initialLotDates.expiry ? inventoryDateOnly(initialLotDates.expiry) : '';
    savedProduct.manufactureDate = inventoryDateOnly(initialLotDates.manufactureDate);
  }
  const duplicate = matchingDuplicate(savedProduct, await getProducts());
  if (duplicate) return Response.json({ error: duplicate.message }, { status: 409, headers: corsHeaders(request) });
  try {
    await saveProduct(savedProduct, { actor, action: 'CREATE' });
  } catch (error) {
    console.error('Não foi possível salvar o produto no catálogo:', error);
    if (error instanceof DuplicateProductError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error instanceof InventoryQuantityMismatchError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um produto com estes dados. Abra o cadastro existente para editá-lo.' }, { status: 409, headers: corsHeaders(request) });
    return Response.json({ error: 'Não foi possível salvar o produto. Verifique a conexão com o banco de dados.' }, { status: 500, headers: corsHeaders(request) });
  }
  return Response.json({ product: savedProduct }, { status: 201, headers: corsHeaders(request) });
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const product = await request.json();
  const productId = String(product?.id || '').trim();
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const quantityMilliUnits = inventoryQuantityMilliUnits(product?.quantity ?? 0);
  const shelfLifeDays = parseShelfLifeDays(product?.shelfLifeDays);
  const categories = Array.isArray(product?.categories)
    ? [...new Set(product.categories.map((category) => String(category).trim()).filter(Boolean))]
    : [];
  const status = ['Ativo', 'Rascunho', 'Arquivado'].includes(product?.status) ? product.status : 'Ativo';
  if (!productId || !title || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isFinite(quantity) || quantity < 0 || quantityMilliUnits === null || !categories.length) return Response.json({ error: 'Informe nome, preço, custo, desconto válido, estoque com até três casas decimais e ao menos uma categoria.' }, { status: 400, headers: corsHeaders(request) });
  if (shelfLifeDays === undefined) return Response.json({ error: 'Informe um prazo de validade em dias entre 1 e 36.500.' }, { status: 400, headers: corsHeaders(request) });
  const organizationError = getProductOrganizationError({ ...product, categories });
  if (organizationError) return Response.json({ error: organizationError }, { status: 400, headers: corsHeaders(request) });

  const products = await getProducts();
  const productIndex = products.findIndex((item) => String(item.id) === productId);
  if (productIndex < 0) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });

  const currentProduct = products[productIndex];
  const priceHistory = appendPriceHistory(currentProduct, { price, cost, discount }, actor);
  const savedProduct = {
    ...currentProduct,
    ...product,
    id: currentProduct.id,
    createdAt: currentProduct.createdAt,
    createdBy: currentProduct.createdBy,
    title,
    price,
    cost,
    discount,
    quantity,
    categories,
    department: String(product?.department || '').trim(),
    subcategory: String(product?.subcategory || '').trim(),
    status,
    shelfLifeDays,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    priceHistory,
  };
  const duplicate = matchingDuplicate(savedProduct, products, productId);
  if (duplicate) return Response.json({ error: duplicate.message }, { status: 409, headers: corsHeaders(request) });
  products[productIndex] = savedProduct;
  try {
    await saveProduct(savedProduct, { actor, action: 'UPDATE', before: currentProduct });
  } catch (error) {
    console.error('Não foi possível atualizar o produto no catálogo:', error);
    if (error instanceof DuplicateProductError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error instanceof InventoryQuantityMismatchError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um produto com estes dados. Abra o cadastro existente para editá-lo.' }, { status: 409, headers: corsHeaders(request) });
    return Response.json({ error: 'Não foi possível atualizar o produto. Verifique a conexão com o banco de dados.' }, { status: 500, headers: corsHeaders(request) });
  }
  return Response.json({ product: savedProduct }, { headers: corsHeaders(request) });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const { id } = await request.json();
  const productId = String(id || '').trim();
  if (!productId) return Response.json({ error: 'Informe o produto que será excluído.' }, { status: 400, headers: corsHeaders(request) });

  const products = await getProducts();
  const product = products.find((item) => String(item.id) === productId);
  if (!product) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });
  try {
    const result = await deleteProduct(productId, actor);
    if (result.error) return Response.json({ error: result.error }, { status: 409, headers: corsHeaders(request) });
    if (!result.deleted) {
      return Response.json({ error: 'Produto não encontrado no banco de dados.' }, { status: 404, headers: corsHeaders(request) });
    }
  } catch (error) {
    console.error('Não foi possível excluir o produto do catálogo:', error);
    return Response.json({ error: 'Não foi possível excluir o produto. Verifique a conexão com o banco de dados.' }, { status: 500, headers: corsHeaders(request) });
  }
  return Response.json({ deletedId: productId }, { headers: corsHeaders(request) });
}
