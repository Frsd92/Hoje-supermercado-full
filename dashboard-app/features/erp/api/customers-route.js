import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { getDaysSincePurchase, parseOrderDate } from '@/lib/order-sort';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const [favoriteRecords, carts, orderList, profiles, addressBooks, users] = await Promise.all([
      prisma.favorite.findMany({
        select: {
          user: { select: { email: true } },
          product: { select: { id: true, externalId: true, title: true, price: true, categories: true, image: true } },
        },
      }),
      prisma.customerCart.findMany({ select: { email: true, items: true } }),
      prisma.order.findMany({
        select: {
          id: true,
          customerEmail: true,
          customerName: true,
          total: true,
          status: true,
          paymentStatus: true,
          refundedAmount: true,
          createdAt: true,
          serviceRequests: {
            select: {
              id: true,
              code: true,
              type: true,
              reason: true,
              orderItemName: true,
              replacementProduct: true,
              status: true,
              requestedBy: true,
              reviewedBy: true,
              reviewedAt: true,
              decisionNote: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      prisma.customerProfile.findMany({
        select: { email: true, fullName: true, monthlyBudget: true, memberSince: true },
      }),
      prisma.customerAddressBook.findMany({ select: { email: true, addresses: true } }),
      prisma.user.findMany({ select: { email: true, createdAt: true } }),
    ]);

    const favoritesByUser = new Map();
    favoriteRecords.forEach(({ user, product }) => {
      const email = user.email.trim().toLowerCase();
      const items = favoritesByUser.get(email) || [];
      items.push({
        id: product.externalId || product.id,
        name: product.title,
        price: Number(product.price),
        category: product.categories[0] || 'Outros',
        image: product.image || '',
      });
      favoritesByUser.set(email, items);
    });
    const cartsByEmail = new Map(carts.map((cart) => {
      if (!Array.isArray(cart.items)) throw new Error(`O carrinho de ${cart.email} possui um formato inválido.`);
      return [cart.email.trim().toLowerCase(), cart.items];
    }));
    const addressesByEmail = new Map(addressBooks.map((addressBook) => {
      if (!Array.isArray(addressBook.addresses)) throw new Error(`A lista de endereços de ${addressBook.email} possui um formato inválido.`);
      return [addressBook.email.trim().toLowerCase(), addressBook.addresses.length];
    }));
    const profilesByEmail = new Map(profiles.map((profile) => [profile.email.toLowerCase(), profile]));
    const userCreatedAtByEmail = new Map(users.map((user) => [user.email.trim().toLowerCase(), user.createdAt]));
    const customerEmails = new Set([
      ...favoritesByUser.keys(),
      ...cartsByEmail.keys(),
      ...orderList.map((order) => order.customerEmail?.trim().toLowerCase()).filter(Boolean),
      ...profiles.map((profile) => profile.email.trim().toLowerCase()),
      ...users.map((user) => user.email.trim().toLowerCase()),
    ].filter((customerEmail) => customerEmail.includes('@')));
    const customers = [...customerEmails].map((email, index) => {
      const profile = profilesByEmail.get(email);
      const favorites = favoritesByUser.get(email) || [];
      const cart = cartsByEmail.get(email) || [];
      const customerOrders = orderList.filter((order) => order.customerEmail?.trim().toLowerCase() === email);
      const activeOrders = customerOrders.filter((order) => (
        order.status !== 'Cancelado'
        && !['pending', 'failed', 'canceled'].includes(String(order.paymentStatus || '').toLowerCase())
      ));
      const datedOrders = activeOrders
        .map((order) => ({ order, date: parseOrderDate(order.createdAt) }))
        .filter(({ date }) => date)
        .sort((first, second) => second.date.getTime() - first.date.getTime());
      const totalSpent = activeOrders.reduce((total, order) => total + realizedRevenue(order), 0);
      const now = new Date();
      const currentMonthSpent = activeOrders.reduce((total, order) => {
        const orderDate = parseOrderDate(order.createdAt);
        return orderDate && orderDate.getFullYear() === now.getFullYear() && orderDate.getMonth() === now.getMonth()
          ? total + realizedRevenue(order)
          : total;
      }, 0);
      const lastOrder = datedOrders[0]?.order;
      const lastPurchaseDate = datedOrders[0]?.date;
      const serviceRequests = customerOrders.flatMap((order) => (order.serviceRequests || []).map((request) => ({
        ...request,
        orderId: order.id,
        orderStatus: order.status,
        orderCreatedAt: order.createdAt,
      }))).sort((first, second) => (
        (parseOrderDate(second.createdAt)?.getTime() || 0) - (parseOrderDate(first.createdAt)?.getTime() || 0)
      ));
      return {
        id: `CLI-${String(index + 1).padStart(4, '0')}`,
        name: profile?.fullName || email,
        email,
        status: 'Ativo',
        orders: activeOrders.length,
        spent: totalSpent,
        monthlyBudget: Number(profile?.monthlyBudget || 0),
        currentMonthSpent,
        budgetDataAvailable: true,
        favorites: favorites.length,
        favoriteItems: favorites,
        cartItems: cart.reduce((total, item) => total + (item.saleUnit === 'Quilograma' ? 1 : (item.quantity || 1)), 0),
        cartProducts: cart.map((item) => ({ ...item, quantity: formatCartQuantity(item) })),
        savedAddressCount: addressesByEmail.get(email) || 0,
        preferences: [],
        tags: [],
        daysWithoutPurchase: getDaysSincePurchase(
          lastPurchaseDate || profile?.memberSince || userCreatedAtByEmail.get(email),
        ),
        lastPurchase: lastOrder?.createdAt || 'Sem compras registradas',
        serviceRequests,
      };
    });

    return Response.json({ customers, budgetDataAvailable: true });
  } catch (error) {
    console.error('Não foi possível carregar os dados de clientes do banco de dados:', error);
    return Response.json({ error: 'Não foi possível carregar os clientes agora.' }, { status: 500 });
  }
}

function money(value) {
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

function realizedRevenue(order) {
  const total = Math.max(0, money(order.total));
  const refundedAmount = Math.min(total, Math.max(0, money(order.refundedAmount)));
  return total - refundedAmount;
}
