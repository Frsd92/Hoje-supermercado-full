import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { getDaysSincePurchase, parseOrderDate } from '@/lib/order-sort';

const dataDirectory = path.join(process.cwd(), 'data');

async function readJson(fileName) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDirectory, fileName), 'utf8'));
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const [favoritesByUser, cartByUser, orders] = await Promise.all([readJson('favorites.json'), readJson('cart.json'), readJson('orders.json')]);
  const orderList = Array.isArray(orders) ? orders : [];
  let profiles = [];
  let budgetDataAvailable = true;
  try {
    profiles = await prisma.customerProfile.findMany({
      select: { email: true, fullName: true, monthlyBudget: true },
    });
  } catch (error) {
    budgetDataAvailable = false;
    console.error('Não foi possível carregar os orçamentos dos clientes para o ERP:', error);
  }
  const profilesByEmail = new Map(profiles.map((profile) => [profile.email.toLowerCase(), profile]));
  const emails = new Set([
    ...Object.keys(favoritesByUser),
    ...Object.keys(cartByUser),
    ...orderList.map((order) => order.customerEmail).filter(Boolean),
    ...profiles.map((profile) => profile.email),
  ].filter((customerEmail) => customerEmail.includes('@')));
  const customers = [...emails].map((customerEmail, index) => {
    const normalizedEmail = customerEmail.toLowerCase();
    const profile = profilesByEmail.get(normalizedEmail);
    const favorites = favoritesByUser[customerEmail] || favoritesByUser[normalizedEmail] || [];
    const cart = cartByUser[customerEmail] || cartByUser[normalizedEmail] || [];
    const customerOrders = orderList.filter((order) => order.customerEmail?.toLowerCase() === normalizedEmail);
    const datedOrders = customerOrders
      .map((order) => ({ order, date: parseOrderDate(order.createdAt) }))
      .filter(({ date }) => date)
      .sort((first, second) => second.date.getTime() - first.date.getTime());
    const totalSpent = customerOrders.reduce((total, order) => total + (Number(String(order.total || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0), 0);
    const now = new Date();
    const currentMonthSpent = customerOrders.reduce((total, order) => {
      const orderDate = parseOrderDate(order.createdAt);
      return orderDate && orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth()
        ? total + (Number(String(order.total || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0)
        : total;
    }, 0);
    const lastOrder = datedOrders[0]?.order;
    const lastPurchaseDate = datedOrders[0]?.date;
    return {
      id: `CLI-${String(index + 1).padStart(4, '0')}`,
      name: profile?.fullName || customerEmail,
      email: customerEmail,
      status: 'Ativo',
      orders: customerOrders.length,
      spent: totalSpent,
      monthlyBudget: Number(profile?.monthlyBudget || 0),
      currentMonthSpent,
      budgetDataAvailable,
      favorites: favorites.length,
      favoriteItems: favorites,
      cartItems: cart.reduce((total, item) => total + (item.saleUnit === 'Quilograma' ? 1 : (item.quantity || 1)), 0),
      cartProducts: cart.map((item) => ({ ...item, quantity: formatCartQuantity(item) })),
      preferences: [],
      tags: [],
      daysWithoutPurchase: getDaysSincePurchase(lastPurchaseDate),
      lastPurchase: lastOrder?.createdAt || 'Sem compras registradas',
    };
  });

  return Response.json({ customers, budgetDataAvailable });
}
