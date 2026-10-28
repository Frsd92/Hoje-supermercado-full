import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function parseOrderTotal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').trim();
  const amount = normalized.includes(',')
    ? Number(normalized.replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.'))
    : Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? amount : 0;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const orders = await prisma.order.findMany({
      take: 500,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerName: true,
        createdAt: true,
        paymentMethod: true,
        paymentStatus: true,
        total: true,
        status: true,
      },
    });
    return Response.json({
      sales: orders.map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        total: parseOrderTotal(order.total),
      })),
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as vendas do ERP:', error);
    return Response.json({ error: 'Não foi possível carregar as vendas agora.' }, { status: 503, headers });
  }
}
