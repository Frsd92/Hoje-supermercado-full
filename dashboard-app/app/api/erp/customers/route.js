import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const dataDirectory = path.join(process.cwd(), 'data');
const allowedEmails = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);

async function readJson(fileName) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDirectory, fileName), 'utf8'));
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const [favoritesByUser, cartByUser, orders] = await Promise.all([readJson('favorites.json'), readJson('cart.json'), readJson('orders.json')]);
  const orderList = Array.isArray(orders) ? orders : [];
  const emails = new Set([
    ...Object.keys(favoritesByUser),
    ...Object.keys(cartByUser),
    ...orderList.map((order) => order.customerEmail).filter(Boolean),
  ].filter((customerEmail) => customerEmail.includes('@')));
  const customers = [...emails].map((customerEmail, index) => {
    const favorites = favoritesByUser[customerEmail] || [];
    const cart = cartByUser[customerEmail] || [];
    const customerOrders = orderList.filter((order) => order.customerEmail === customerEmail);
    const totalSpent = customerOrders.reduce((total, order) => total + (Number(String(order.total || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0), 0);
    const lastOrder = customerOrders[customerOrders.length - 1];
    return {
      id: `CLI-${String(index + 1).padStart(4, '0')}`,
      name: customerEmail,
      email: customerEmail,
      status: 'Ativo',
      orders: customerOrders.length,
      spent: totalSpent,
      favorites: favorites.length,
      favoriteItems: favorites,
      cartItems: cart.reduce((total, item) => total + (item.quantity || 1), 0),
      cartProducts: cart,
      preferences: [],
      tags: [],
      daysWithoutPurchase: lastOrder ? Math.max(0, Math.floor((Date.now() - new Date(lastOrder.createdAt).getTime()) / 86400000)) : null,
      lastPurchase: lastOrder?.createdAt || 'Sem compras registradas',
    };
  });

  return Response.json({ customers });
}
