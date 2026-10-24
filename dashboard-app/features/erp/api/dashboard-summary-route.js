import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { readLegacyProducts } from '@/features/erp/api/product-catalog';
import { countDashboardCustomers, mergeDashboardProducts } from '@/features/erp/api/dashboard-summary';
import { deriveDashboardMetrics } from '@/features/erp/pages/dashboard-metrics';
import { prisma } from '@/lib/prisma';

function response(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return response({ error: 'Acesso negado.' }, 403);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const recentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const dataStart = new Date(Math.min(monthStart.getTime(), recentStart.getTime()));
  const lotCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);

  try {
    const [
      databaseProducts,
      legacyProducts,
      orders,
      recentLots,
      users,
      profiles,
      carts,
      favorites,
      orderCustomers,
      couponRecipients,
      pendingOrderCount,
    ] = await Promise.all([
      prisma.product.findMany({
        select: { id: true, externalId: true, title: true, cost: true, quantity: true, status: true },
      }),
      readLegacyProducts(),
      prisma.order.findMany({
        where: { createdAt: { gte: dataStart } },
        select: {
          id: true,
          createdAt: true,
          status: true,
          total: true,
          items: { select: { id: true, name: true, productId: true, quantity: true } },
        },
      }),
      prisma.productLot.findMany({
        where: { quantity: { gt: 0 }, expiry: { lte: lotCutoff } },
        select: { quantity: true, expiry: true },
      }),
      prisma.user.findMany({ select: { email: true } }),
      prisma.customerProfile.findMany({ select: { email: true } }),
      prisma.customerCart.findMany({ select: { email: true } }),
      prisma.favorite.findMany({ select: { user: { select: { email: true } } } }),
      prisma.order.findMany({
        where: { customerEmail: { not: null } },
        distinct: ['customerEmail'],
        select: { customerEmail: true },
      }),
      prisma.couponRecipient.findMany({ select: { email: true } }),
      prisma.order.count({ where: { status: 'Recebido' } }),
    ]);

    const products = mergeDashboardProducts(databaseProducts, legacyProducts);
    const customersCount = countDashboardCustomers([
      users.map(({ email }) => email),
      profiles.map(({ email }) => email),
      carts.map(({ email }) => email),
      favorites.map(({ user }) => user.email),
      orderCustomers.map(({ customerEmail }) => customerEmail),
      couponRecipients.map(({ email }) => email),
    ]);
    const metrics = deriveDashboardMetrics({ products, orders, customers: [], lots: recentLots, now });
    metrics.activeCustomerCount = customersCount;

    return response({
      metrics,
      productsCount: products.length,
      customersCount,
      pendingReceivedOrderCount: Number(pendingOrderCount),
    });
  } catch (error) {
    console.error('Não foi possível carregar o resumo do ERP:', error);
    return response({ error: 'Não foi possível carregar os indicadores agora. Tente novamente.' }, 503);
  }
}
