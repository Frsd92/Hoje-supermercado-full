import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { serializeOrders } from '@/features/erp/api/order-serialization';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ orders: [] }, { status: 401 });

  try {
    const orders = await prisma.order.findMany({
      where: { customerEmail: { equals: session.user.email.trim(), mode: 'insensitive' } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ orders: sortOrdersNewestFirst(serializeOrders(orders)) });
  } catch (error) {
    console.error('Não foi possível carregar o histórico de pedidos do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar seus pedidos agora.' }, { status: 500 });
  }
}
