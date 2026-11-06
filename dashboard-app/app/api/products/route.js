import { createHash } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { hasCustomerDashboardAccess } from '@/features/auth/access';
import { appendPriceHistory } from '@/features/erp/api/price-history';
import {
  calculateSalePrice,
  getFlashOfferStatus,
  validateFlashOfferConfiguration,
} from '@/features/erp/api/product-pricing';
import { findProductIdentityConflict, getProductAuditChanges, productAuditSnapshot, productIdentityKeys } from '@/features/erp/api/product-audit';
import { normalizeProductCest } from '@/features/erp/api/product-cest';
import { normalizeProductMainCategories } from '@/features/erp/product-organization';
import { syncProductToBling } from '@/features/erp/api/bling-products';
import { validateChangedProductNcm } from '@/features/erp/api/product-ncm';
import {
  addInventoryLot,
  inventoryDateOnly,
  inventoryQuantityMilliUnits,
  parseInventoryDate,
  parseShelfLifeDays,
  resolveInventoryExpiry,
  requiresInventoryExpiry,
} from '@/features/erp/api/inventory-lots';
import {
  getErpProductList,
  getProductById,
  getProductCatalog,
  getPublicProductCatalog,
  readLegacyProducts,
  serializeProduct,
} from '@/features/erp/api/product-catalog';
import { publicProductImage } from '@/features/erp/api/product-image-url';
import { getProductOrganizationError } from '@/features/erp/product-organization';
import { getAvailableProductSubstitutes, isProductAvailableForQuantity } from '@/features/shopping/product-substitutes';
import { prisma } from '@/lib/prisma';

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
  'blingProductId',
  'blingSyncStatus',
  'blingSyncError',
  'blingSyncedAt',
  'blingSyncStartedAt',
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

function productMetadata(product) {
  const metadata = { ...product };
  for (const field of [
    'id', 'title', 'description', 'price', 'cost', 'discount', 'quantity',
    'sku', 'barcode', 'brand', 'supplier', 'subcategory', 'image', 'status',
    'expiry', 'expiryMode', 'categories', 'createdBy', 'createdAt', 'updatedAt',
    'blingProductId', 'blingSyncStatus', 'blingSyncError', 'blingSyncedAt', 'blingSyncStartedAt',
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
    categories: normalizeProductMainCategories(product.categories),
    createdBy: product.createdBy ? String(product.createdBy) : null,
    metadata,
  };
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

async function syncSavedProduct(productId) {
  try {
    return await syncProductToBling(productId);
  } catch (error) {
    console.error('O produto foi salvo no Hoje, mas não foi possível iniciar a sincronização com o Bling:', error);
    return {
      status: 'failed',
      error: String(error?.message || 'Não foi possível iniciar a sincronização com o Bling.').slice(0, 500),
    };
  }
}

function matchingDuplicate(product, products, excludedId = '') {
  const conflict = findProductIdentityConflict(product, products, excludedId);
  return conflict ? new DuplicateProductError(conflict.product.title, conflict.field) : null;
}

async function saveProduct(product, { actor, action, before = null }) {
  const ncmValidation = await validateChangedProductNcm(product, before);
  if (ncmValidation.status === 'pending') {
    console.warn('O produto será salvo com a validação do NCM pendente porque a tabela oficial está indisponível.');
  }
  const productToSave = {
    ...product,
    ncmValidationStatus: ncmValidation.status === 'unchanged'
      ? product.ncmValidationStatus || before?.ncmValidationStatus || 'pending'
      : ncmValidation.status,
  };
  const externalId = String(productToSave.id || '').trim();
  const data = productDatabaseData(productToSave);
  const keys = productIdentityKeys(productToSave);
  return prisma.$transaction(async (transaction) => {
    const existing = externalId
      ? await transaction.product.findFirst({ where: { OR: [{ externalId }, { id: externalId }] } })
      : null;
    if (existing) {
      const submittedQuantity = inventoryQuantityMilliUnits(productToSave.quantity);
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
        lotCode: productToSave.lot,
        quantity: data.quantity,
        expiry: productToSave.expiry,
        manufactureDate: productToSave.manufactureDate,
        shelfLifeDays: productToSave.expiryMode === 'days' ? productToSave.shelfLifeDays : null,
        location: productToSave.location,
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
    const auditedProduct = { ...serializeProduct(saved), id: productToSave.id || saved.id };
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
  const items = await prisma.orderItem.findMany({
    where: { order: { status: { not: 'Cancelado' } } },
    select: {
      name: true,
      quantity: true,
      product: { select: { id: true, externalId: true, title: true } },
    },
  });
  return items.reduce((sales, item) => {
    const quantity = Number(item.quantity) || 0;
    const keys = new Set([
      item.product?.id,
      item.product?.externalId,
      item.product?.title,
      item.name,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));
    keys.forEach((key) => { sales[key] = (sales[key] || 0) + quantity; });
    return sales;
  }, {});
}

function ensurePriceHistory(product) {
  return {
    ...product,
    priceHistory: Array.isArray(product.priceHistory) ? product.priceHistory : [],
  };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;
  const purpose = searchParams.get('purpose');
  if (purpose === 'erp-edit') {
    const session = await getServerSession(authOptions);
    if (!hasErpAccess(session?.user)) {
      return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
    }
    const productId = searchParams.get('id')?.trim();
    if (!productId) {
      return Response.json({ error: 'Informe o produto que será alterado.' }, { status: 400, headers: corsHeaders(request) });
    }
    try {
      const product = await getProductById(productId);
      if (!product) {
        return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });
      }
      return Response.json({ product }, {
        headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
      });
    } catch (error) {
      console.error(`Não foi possível carregar o produto ${productId} para edição:`, error);
      return Response.json({ error: 'Não foi possível carregar o produto. Verifique a conexão e tente novamente.' }, {
        status: 500,
        headers: corsHeaders(request),
      });
    }
  }
  if (purpose === 'erp-list') {
    const session = await getServerSession(authOptions);
    if (!hasErpAccess(session?.user)) {
      return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
    }
    try {
      const products = await getErpProductList();
      return Response.json({ products }, {
        headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
      });
    } catch (error) {
      console.error('Não foi possível carregar a listagem rápida do catálogo ERP:', error);
      return Response.json({ error: 'Não foi possível carregar os produtos. Verifique a conexão e tente novamente.' }, {
        status: 500,
        headers: corsHeaders(request),
      });
    }
  }
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
      const legacyProducts = await readLegacyProducts();
      product = legacyProducts.find((item) => String(item.id) === productId) || null;
    }

    const image = typeof product?.image === 'string' ? product.image : '';
    const imageMatch = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(image);
    const currentVersion = image
      ? `${createHash('md5').update(image).digest('hex')}-webp-256-v2`
      : '';
    let canViewInactiveImage = false;
    if (product?.status !== 'Ativo') {
      const session = await getServerSession(authOptions);
      canViewInactiveImage = hasErpAccess(session?.user);
    }
    if ((!canViewInactiveImage && product?.status !== 'Ativo') || !imageMatch || currentVersion !== version) {
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
    let optimizedImage;
    try {
      const { optimizeProductImage } = await import('@/features/erp/api/product-image');
      optimizedImage = await optimizeProductImage(imageBytes);
    } catch (error) {
      console.error(`Não foi possível otimizar a imagem do produto ${productId}:`, error);
      return Response.json({ error: 'Não foi possível preparar a imagem do produto.' }, {
        status: 500,
        headers: corsHeaders(request),
      });
    }

    return new Response(optimizedImage, {
      headers: {
        ...corsHeaders(request),
        'Content-Type': 'image/webp',
        'Content-Length': String(optimizedImage.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  if (purpose === 'substitutes') {
    let requestedItems;
    try {
      requestedItems = JSON.parse(searchParams.get('items') || 'null');
    } catch {
      requestedItems = null;
    }
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 10) {
      return Response.json({ error: 'Produto ou quantidade inválida.' }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }
    const items = requestedItems.map((item) => ({
      id: String(item?.id || '').trim(),
      title: String(item?.title || '').trim().slice(0, 160),
      category: String(item?.category || '').trim().slice(0, 80),
      quantity: Number(item?.quantity),
      saleUnit: item?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
      key: String(item?.key || '').slice(0, 160),
    }));
    if (items.some((item) => (
      !item.id
      || !item.key
      || !Number.isFinite(item.quantity)
      || item.quantity <= 0
      || item.quantity > 9999
    ))) {
      return Response.json({ error: 'Produto ou quantidade inválida.' }, {
        status: 400,
        headers: corsHeaders(request),
      });
    }
    const excludedIds = String(searchParams.get('exclude') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100);

    try {
      const products = await getProductCatalog();
      const substitutions = items.map((item) => {
        const source = products.find((product) => String(product.id) === item.id) || null;
        const comparisonSource = source || {
          id: item.id,
          title: item.title,
          categories: item.category ? [item.category] : [],
          subcategory: item.category,
        };
        const substitutes = getAvailableProductSubstitutes({
          source: comparisonSource,
          products: products.filter((product) => (
            (product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade') === item.saleUnit
          )),
          quantity: item.quantity,
          excludedIds,
        }).map((product) => ({
          id: product.id,
          title: product.title,
          categories: Array.isArray(product.categories) ? product.categories : [],
          category: product.categories?.[0] || product.department || item.category,
          image: publicProductImage(product),
          price: Number(product.price) || 0,
          salePrice: calculateSalePrice(product),
          saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
        }));
        return {
          key: item.key,
          sourceAvailable: source ? isProductAvailableForQuantity(source, item.quantity) : false,
          substitutes,
        };
      });
      return Response.json({
        items: substitutions,
      }, {
        headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
      });
    } catch (error) {
      console.error('Não foi possível sugerir substitutos para o carrinho:', error);
      return Response.json({ error: 'Não foi possível verificar a disponibilidade dos produtos.' }, {
        status: 500,
        headers: corsHeaders(request),
      });
    }
  }

  if (purpose === 'shopping') {
    const session = await getServerSession(authOptions);
    if (!hasCustomerDashboardAccess(session?.user)) {
      return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
    }
    const [products, productRecords] = await Promise.all([
      getProductCatalog(),
      prisma.product.findMany({ where: { status: 'Ativo' }, select: { id: true, externalId: true } }),
    ]);
    const catalogIdByPublicId = new Map(productRecords.map((record) => [
      String(record.externalId || record.id),
      String(record.id),
    ]));
    const shoppingProducts = products
      .filter((product) => product.status === 'Ativo')
      .map((product) => ({
        id: product.id,
        catalogId: catalogIdByPublicId.get(String(product.id)) || product.id,
        title: product.title,
        categories: Array.isArray(product.categories) ? product.categories : [],
        image: publicProductImage(product),
        price: Number(product.price) || 0,
        salePrice: calculateSalePrice(product),
        saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
        availableQuantity: Number(product.quantity),
      }));
    return Response.json({ products: shoppingProducts }, {
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
  const products = purpose === 'search' || purpose === 'store'
    ? await getPublicProductCatalog()
    : await getProductCatalog();
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
    const now = Date.now();
    const storeProducts = products
      .filter((product) => product.status === 'Ativo')
      .map((product) => {
        const flashOffer = getFlashOfferStatus(product, now);
        return {
          id: product.id,
          title: product.title,
          description: product.description || '',
          price: Number(product.price) || 0,
          salePrice: calculateSalePrice(product, now),
          flashOfferActive: flashOffer.state === 'active',
          flashOfferEndsAt: ['active', 'scheduled'].includes(flashOffer.state)
            ? new Date(flashOffer.endsAt).toISOString()
            : null,
          flashOfferScheduledStart: flashOffer.state === 'scheduled'
            ? new Date(flashOffer.startsAt).toISOString()
            : null,
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
        };
      });
    return Response.json({ products: storeProducts }, {
      headers: { ...corsHeaders(request), 'Cache-Control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=10' },
    });
  }
  const session = await getServerSession(authOptions);
  const canViewPrivateFields = hasErpAccess(session?.user);
  if (purpose === 'flash-admin') {
    if (!canViewPrivateFields) {
      return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
    }
    const flashProducts = products.map((product) => ({
      id: product.id,
      title: product.title,
      sku: product.sku || '',
      barcode: product.barcode || '',
      barcodes: Array.isArray(product.barcodes) ? product.barcodes : [],
      categories: Array.isArray(product.categories) ? product.categories : [],
      department: product.department || '',
      subcategory: product.subcategory || '',
      price: Number(product.price) || 0,
      promotionalPrice: product.promotionalPrice || 0,
      discount: product.discount || 0,
      salePrice: calculateSalePrice(product),
      saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
      status: product.status,
      flashOfferEnabled: product.flashOfferEnabled === true,
      flashOfferPrice: Number(product.flashOfferPrice) || 0,
      flashOfferStart: product.flashOfferStart || '',
      flashOfferEnd: product.flashOfferEnd || '',
      flashOfferStatus: getFlashOfferStatus(product).state,
    }));
    return Response.json({ products: flashProducts }, {
      headers: { ...corsHeaders(request), 'Cache-Control': 'private, no-store, max-age=0' },
    });
  }
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
  let cest;
  try {
    cest = normalizeProductCest(product?.cest);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: corsHeaders(request) });
  }
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const quantityMilliUnits = inventoryQuantityMilliUnits(product?.quantity ?? 0);
  const shelfLifeDays = parseShelfLifeDays(product?.shelfLifeDays);
  const expiryMode = product?.expiryMode || (shelfLifeDays ? 'days' : 'date');
  const categories = normalizeProductMainCategories(product?.categories);
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
    cest,
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
  const duplicate = matchingDuplicate(savedProduct, await getProductCatalog());
  if (duplicate) return Response.json({ error: duplicate.message }, { status: 409, headers: corsHeaders(request) });
  let savedProductRecord;
  try {
    savedProductRecord = await saveProduct(savedProduct, { actor, action: 'CREATE' });
    savedProduct.blingSync = await syncSavedProduct(savedProductRecord.id);
  } catch (error) {
    console.error('Não foi possível salvar o produto no catálogo:', error);
    if (error?.status === 422) return Response.json({ error: error.message }, { status: 422, headers: corsHeaders(request) });
    if (error?.status === 502 || error?.name === 'AbortError' || error?.name === 'TimeoutError') return Response.json({ error: 'Não foi possível validar o NCM na tabela oficial agora. Tente novamente.' }, { status: 502, headers: corsHeaders(request) });
    if (error instanceof DuplicateProductError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error instanceof InventoryQuantityMismatchError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um produto com estes dados. Abra o cadastro existente para editá-lo.' }, { status: 409, headers: corsHeaders(request) });
    return Response.json({ error: 'Não foi possível salvar o produto. Verifique a conexão com o banco de dados.' }, { status: 500, headers: corsHeaders(request) });
  }
  savedProduct.ncmValidationStatus = savedProductRecord.metadata?.ncmValidationStatus || 'not_applicable';
  return Response.json({ product: savedProduct }, { status: 201, headers: corsHeaders(request) });
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const product = await request.json();
  if (product?.purpose === 'flash-admin') {
    const productId = String(product?.id || '').trim();
    if (!productId) return Response.json({ error: 'Selecione um produto válido.' }, { status: 400, headers: corsHeaders(request) });

    const currentProduct = await getProductById(productId);
    if (!currentProduct) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });
    let offerFields;
    if (product.flashOfferEnabled === false) {
      offerFields = { flashOfferEnabled: false };
    } else if (product.flashOfferEnabled === true) {
      const validation = validateFlashOfferConfiguration(currentProduct, product);
      if (validation.error) return Response.json({ error: validation.error }, { status: 400, headers: corsHeaders(request) });
      offerFields = validation.value;
    } else {
      return Response.json({ error: 'Informe se a oferta relâmpago deve ficar ativa ou desativada.' }, { status: 400, headers: corsHeaders(request) });
    }

    const savedProduct = {
      ...currentProduct,
      ...offerFields,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    try {
      const saved = await saveProduct(savedProduct, { actor, action: 'UPDATE', before: currentProduct });
      savedProduct.blingSync = await syncSavedProduct(saved.id);
    } catch (error) {
      console.error('Não foi possível salvar a oferta relâmpago do produto:', error);
      return Response.json({ error: 'Não foi possível salvar a oferta relâmpago. Verifique a conexão e tente novamente.' }, { status: 500, headers: corsHeaders(request) });
    }
    return Response.json({
      product: {
        id: savedProduct.id,
        title: savedProduct.title,
        flashOfferEnabled: savedProduct.flashOfferEnabled === true,
        flashOfferPrice: Number(savedProduct.flashOfferPrice) || 0,
        flashOfferStart: savedProduct.flashOfferStart || '',
        flashOfferEnd: savedProduct.flashOfferEnd || '',
        flashOfferStatus: getFlashOfferStatus(savedProduct).state,
      },
    }, { headers: corsHeaders(request) });
  }

  const productId = String(product?.id || '').trim();
  let cest;
  try {
    cest = normalizeProductCest(product?.cest);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers: corsHeaders(request) });
  }
  const title = String(product?.title || '').trim();
  const price = Number(product?.price);
  const cost = Number(product?.cost || 0);
  const discount = Number(product?.discount || 0);
  const quantity = Number(product?.quantity || 0);
  const quantityMilliUnits = inventoryQuantityMilliUnits(product?.quantity ?? 0);
  const shelfLifeDays = parseShelfLifeDays(product?.shelfLifeDays);
  const categories = normalizeProductMainCategories(product?.categories);
  const status = ['Ativo', 'Rascunho', 'Arquivado'].includes(product?.status) ? product.status : 'Ativo';
  if (!productId || !title || !Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(discount) || discount < 0 || discount > 100 || !Number.isFinite(quantity) || quantity < 0 || quantityMilliUnits === null || !categories.length) return Response.json({ error: 'Informe nome, preço, custo, desconto válido, estoque com até três casas decimais e ao menos uma categoria.' }, { status: 400, headers: corsHeaders(request) });
  if (shelfLifeDays === undefined) return Response.json({ error: 'Informe um prazo de validade em dias entre 1 e 36.500.' }, { status: 400, headers: corsHeaders(request) });
  const organizationError = getProductOrganizationError({ ...product, categories });
  if (organizationError) return Response.json({ error: organizationError }, { status: 400, headers: corsHeaders(request) });

  const currentProduct = await getProductById(productId);
  if (!currentProduct) return Response.json({ error: 'Produto não encontrado.' }, { status: 404, headers: corsHeaders(request) });
  const priceHistory = appendPriceHistory(currentProduct, { price, cost, discount }, actor);
  const savedProduct = {
    ...currentProduct,
    ...product,
    cest,
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
  const duplicate = matchingDuplicate(savedProduct, await readLegacyProducts(), productId);
  if (duplicate) return Response.json({ error: duplicate.message }, { status: 409, headers: corsHeaders(request) });
  let savedProductRecord;
  try {
    savedProductRecord = await saveProduct(savedProduct, { actor, action: 'UPDATE', before: currentProduct });
    savedProduct.blingSync = await syncSavedProduct(savedProductRecord.id);
  } catch (error) {
    console.error('Não foi possível atualizar o produto no catálogo:', error);
    if (error?.status === 422) return Response.json({ error: error.message }, { status: 422, headers: corsHeaders(request) });
    if (error?.status === 502 || error?.name === 'AbortError' || error?.name === 'TimeoutError') return Response.json({ error: 'Não foi possível validar o NCM na tabela oficial agora. Tente novamente.' }, { status: 502, headers: corsHeaders(request) });
    if (error instanceof DuplicateProductError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error instanceof InventoryQuantityMismatchError) return Response.json({ error: error.message }, { status: 409, headers: corsHeaders(request) });
    if (error?.code === 'P2002') return Response.json({ error: 'Já existe um produto com estes dados. Abra o cadastro existente para editá-lo.' }, { status: 409, headers: corsHeaders(request) });
    return Response.json({ error: 'Não foi possível atualizar o produto. Verifique a conexão com o banco de dados.' }, { status: 500, headers: corsHeaders(request) });
  }
  savedProduct.ncmValidationStatus = savedProductRecord.metadata?.ncmValidationStatus || 'not_applicable';
  return Response.json({ product: savedProduct }, { headers: corsHeaders(request) });
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const { id } = await request.json();
  const productId = String(id || '').trim();
  if (!productId) return Response.json({ error: 'Informe o produto que será excluído.' }, { status: 400, headers: corsHeaders(request) });

  const product = await getProductById(productId);
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
