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
        refundedAmount: true,
        status: true,
        updatedAt: true,
        refundRequests: {
          where: { status: 'completed' },
          orderBy: { updatedAt: 'asc' },
          select: {
            id: true,
            amount: true,
            events: {
              where: { action: 'completed' },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
        paymentEvents: {
          where: { eventType: 'charge.refunded' },
          orderBy: { receivedAt: 'desc' },
          take: 1,
          select: { receivedAt: true },
        },
      },
    });
    return Response.json({
      sales: orders.map((order) => {
        const createdAt = order.createdAt.toISOString();
        return {
          id: order.id,
          customerName: order.customerName,
          createdAt,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          status: order.status,
          total: parseOrderTotal(order.total),
          refundedAmount: parseOrderTotal(order.refundedAmount),
          refundDate: order.paymentEvents[0]?.receivedAt?.toISOString()
            || order.updatedAt?.toISOString()
            || createdAt,
          refunds: order.refundRequests.map((refund) => ({
            id: refund.id,
            amount: parseOrderTotal(refund.amount),
            date: refund.events[0]?.createdAt?.toISOString() || order.updatedAt.toISOString(),
          })),
        };
      }),
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as vendas do ERP:', error);
    return Response.json({ error: 'Não foi possível carregar as vendas agora.' }, { status: 503, headers });
  }
}
