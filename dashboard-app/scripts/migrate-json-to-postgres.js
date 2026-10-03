import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { parseOrderDate } from '../lib/order-sort.js';

const dataDir = path.join(process.cwd(), 'data');
async function readJson(name, fallback) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.warn(`Arquivo legado ${name} ausente; a importação dessa fonte será ignorada.`);
    return fallback;
  }
}

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '0').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

function isRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function formatPrice(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function normalizeTitle(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const products = await readJson('products.json', []);
const favorites = await readJson('favorites.json', {});
const orders = await readJson('orders.json', []);
const notifications = await readJson('notifications.json', []);
if (!Array.isArray(products) || !isRecord(favorites) || !Array.isArray(orders) || !Array.isArray(notifications)) {
  throw new Error('Um dos arquivos legados possui um formato inválido; nenhuma importação foi iniciada.');
}
const productByName = new Map();

for (const product of products) {
  if (!product.id || !product.title) throw new Error('O catálogo legado contém um produto sem identificador ou nome.');
  const externalId = String(product.id);
  const existing = await prisma.product.findUnique({
    where: { externalId },
    select: { metadata: true },
  });
  const storedMetadata = isRecord(existing?.metadata) ? existing.metadata : {};
  const catalogFields = new Set([
    'id', 'externalId', 'identityTitle', 'identitySku', 'identityBarcode', 'title', 'description',
    'price', 'cost', 'discount', 'quantity', 'sku', 'barcode', 'brand', 'supplier', 'subcategory',
    'image', 'status', 'expiry', 'categories', 'createdBy', 'createdAt', 'updatedAt',
  ]);
  const sourceMetadata = Object.fromEntries(Object.entries(product).filter(([key]) => !catalogFields.has(key)));
  const metadata = { ...sourceMetadata, ...storedMetadata };
  const productData = {
    title: product.title,
    description: product.description || '',
    price: parsePrice(product.price),
    cost: parsePrice(product.cost),
    discount: parsePrice(product.discount),
    quantity: Number(product.quantity) || 0,
    sku: product.sku || null,
    barcode: product.barcode || null,
    brand: product.brand || null,
    supplier: product.supplier || null,
    subcategory: product.subcategory || null,
    image: product.image || null,
    status: product.status || 'Ativo',
    expiry: parseOrderDate(product.expiry),
    categories: Array.isArray(product.categories) ? product.categories : [],
    createdBy: product.createdBy || null,
    metadata,
  };
  const saved = await prisma.product.upsert({
    where: { externalId },
    update: productData,
    create: { externalId, ...productData },
  });
  productByName.set(normalizeTitle(saved.title), saved);
}

for (const [email, items] of Object.entries(favorites)) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.upsert({ where: { email: normalizedEmail }, update: {}, create: { email: normalizedEmail } });
  if (!Array.isArray(items)) throw new Error(`A lista de favoritos de ${normalizedEmail} possui um formato inválido.`);
  for (const item of items) {
    const product = productByName.get(normalizeTitle(item.name)) || await prisma.product.create({ data: { title: item.name, description: '', price: parsePrice(item.price), cost: 0, categories: [item.category || 'Outros'], image: item.image || null } });
    await prisma.favorite.upsert({ where: { userId_productId: { userId: user.id, productId: product.id } }, update: {}, create: { userId: user.id, productId: product.id } });
  }
}

for (const order of orders) {
  if (!order.id || !Array.isArray(order.items)) throw new Error('Um pedido legado não possui identificador ou lista de itens válida.');
  const orderId = String(order.id);
  const email = String(order.customerEmail || '').trim().toLowerCase();
  const user = email
    ? await prisma.user.upsert({ where: { email }, update: { name: order.customerName || undefined }, create: { email, name: order.customerName || null } })
    : null;
  const orderItems = order.items.map((item) => {
    const quantity = Number(item.quantity);
    if (!item.name || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`O pedido ${orderId} contém um item inválido.`);
    }
    return {
      product: productByName.get(normalizeTitle(item.name)),
      name: String(item.name),
      price: typeof item.price === 'string' ? item.price : formatPrice(parsePrice(item.price)),
      quantity,
      unit: item.unit === 'kg' || item.saleUnit === 'Quilograma' ? 'kg' : 'unidade',
      promotionType: item.promotionType || null,
      promotionDiscount: parsePrice(item.promotionDiscount),
    };
  });
  const subtotal = orderItems.reduce((sum, item) => sum + parsePrice(item.price) * item.quantity, 0);
  const total = typeof order.total === 'string' ? order.total : formatPrice(parsePrice(order.total));
  const couponCode = String(order.couponCode || '').trim().toUpperCase();
  const couponDiscountPercent = Number.isInteger(Number(order.couponDiscountPercent))
    ? Number(order.couponDiscountPercent)
    : null;
  const couponDiscountAmount = order.couponDiscountAmount !== undefined
    ? parsePrice(order.couponDiscountAmount)
    : couponCode ? Math.max(0, subtotal - parsePrice(total)) : 0;
  const addressDetails = isRecord(order.addressDetails) ? order.addressDetails : undefined;
  const createdAt = parseOrderDate(order.createdAt) || new Date();
  const savedOrder = await prisma.order.upsert({
    where: { id: orderId },
    update: {
      ...(addressDetails ? { addressDetails } : {}),
      ...(order.paymentMethod ? { paymentMethod: String(order.paymentMethod) } : {}),
      ...(typeof order.includeCpfOnReceipt === 'boolean' ? { includeCpfOnReceipt: order.includeCpfOnReceipt } : {}),
      ...(order.includeCpfOnReceipt && order.invoiceCpf ? { invoiceCpf: String(order.invoiceCpf) } : {}),
      ...(couponCode ? { couponCode } : {}),
      ...(couponDiscountPercent === null ? {} : { couponDiscountPercent }),
      subtotal: Number(subtotal.toFixed(2)),
      couponDiscountAmount: Number(couponDiscountAmount.toFixed(2)),
    },
    create: {
      id: orderId,
      status: order.status || 'Recebido',
      total,
      subtotal: Number(subtotal.toFixed(2)),
      address: order.address || '',
      ...(addressDetails ? { addressDetails } : {}),
      customerName: order.customerName || null,
      customerEmail: email || null,
      userId: user?.id || null,
      paymentMethod: order.paymentMethod || 'nao_informado',
      includeCpfOnReceipt: order.includeCpfOnReceipt === true,
      invoiceCpf: order.includeCpfOnReceipt && order.invoiceCpf ? String(order.invoiceCpf) : null,
      couponCode: couponCode || null,
      couponDiscountPercent,
      couponDiscountAmount: Number(couponDiscountAmount.toFixed(2)),
      createdAt,
    },
  });
  const existingItems = await prisma.orderItem.count({ where: { orderId } });
  if (!existingItems && orderItems.length) {
    await prisma.orderItem.createMany({
      data: orderItems.map((item, index) => ({
        id: `legacy-${orderId}-${index}`,
        orderId,
        productId: item.product?.id || null,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        unit: item.unit,
        unitCost: null,
        promotionType: item.promotionType,
        promotionDiscount: item.promotionDiscount,
      })),
    });
  }
  if (couponCode && email) {
    const campaign = await prisma.couponCampaign.findUnique({ where: { code: couponCode }, select: { id: true } });
    if (campaign) {
      await prisma.couponRedemption.createMany({
        data: [{ id: randomUUID(), campaignId: campaign.id, email, orderId: savedOrder.id }],
        skipDuplicates: true,
      });
    }
  }
}

for (const notification of notifications) {
  await prisma.notification.upsert({ where: { id: notification.id }, update: {}, create: { id: notification.id, title: notification.title, message: notification.message, audience: notification.audience || 'all', type: notification.type || 'promotion', durationDays: notification.durationDays || 7, expiresAt: parseOrderDate(notification.expiresAt) || new Date(Date.now() + 7 * 86400000), createdBy: notification.createdBy || 'migration' } });
}

console.log(`Migrados: ${products.length} produtos, ${orders.length} pedidos e ${notifications.length} notificações.`);
await prisma.$disconnect();
