import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma.js';

const dataDir = path.join(process.cwd(), 'data');
const readJson = async (name, fallback) => {
  try { return JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8')); } catch { return fallback; }
};
const parseDate = (value) => value ? new Date(value) : null;
const parsePrice = (value) => Number(String(value || '0').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0;

const products = await readJson('products.json', []);
const favorites = await readJson('favorites.json', {});
const orders = await readJson('orders.json', []);
const notifications = await readJson('notifications.json', []);
const productByName = new Map();

for (const product of products) {
  const saved = await prisma.product.upsert({
    where: { externalId: product.id },
    update: { title: product.title, description: product.description || '', price: product.price, cost: product.cost || 0, discount: product.discount || 0, quantity: product.quantity || 0, sku: product.sku || null, barcode: product.barcode || null, brand: product.brand || null, supplier: product.supplier || null, subcategory: product.subcategory || null, image: product.image || null, status: product.status || 'Ativo', expiry: parseDate(product.expiry), categories: product.categories || [], createdBy: product.createdBy || null },
    create: { externalId: product.id, title: product.title, description: product.description || '', price: product.price, cost: product.cost || 0, discount: product.discount || 0, quantity: product.quantity || 0, sku: product.sku || null, barcode: product.barcode || null, brand: product.brand || null, supplier: product.supplier || null, subcategory: product.subcategory || null, image: product.image || null, status: product.status || 'Ativo', expiry: parseDate(product.expiry), categories: product.categories || [], createdBy: product.createdBy || null },
  });
  productByName.set(saved.title, saved);
}

for (const [email, items] of Object.entries(favorites)) {
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email } });
  for (const item of items || []) {
    const product = productByName.get(item.name) || await prisma.product.create({ data: { title: item.name, description: '', price: parsePrice(item.price), cost: 0, categories: [item.category || 'Outros'], image: item.image || null } });
    await prisma.favorite.upsert({ where: { userId_productId: { userId: user.id, productId: product.id } }, update: {}, create: { userId: user.id, productId: product.id } });
  }
}

for (const order of orders) {
  const user = order.customerEmail ? await prisma.user.upsert({ where: { email: order.customerEmail }, update: { name: order.customerName || undefined }, create: { email: order.customerEmail, name: order.customerName || null } }) : null;
  await prisma.order.upsert({ where: { id: order.id }, update: { status: order.status || 'Recebido', total: order.total || 'R$ 0,00', address: order.address || '', userId: user?.id || null }, create: { id: order.id, status: order.status || 'Recebido', total: order.total || 'R$ 0,00', address: order.address || '', customerName: order.customerName || null, customerEmail: order.customerEmail || null, userId: user?.id || null, createdAt: parseDate(order.createdAt) || new Date() }, });
  for (const item of order.items || []) {
    const product = productByName.get(item.name);
    await prisma.orderItem.create({ data: { orderId: order.id, productId: product?.id || null, name: item.name, price: item.price || 'R$ 0,00', quantity: Number(item.quantity) || 1 } });
  }
}

for (const notification of notifications) {
  await prisma.notification.upsert({ where: { id: notification.id }, update: {}, create: { id: notification.id, title: notification.title, message: notification.message, audience: notification.audience || 'all', type: notification.type || 'promotion', durationDays: notification.durationDays || 7, expiresAt: parseDate(notification.expiresAt) || new Date(Date.now() + 7 * 86400000), createdBy: notification.createdBy || 'migration' } });
}

console.log(`Migrados: ${products.length} produtos, ${orders.length} pedidos e ${notifications.length} notificações.`);
await prisma.$disconnect();
