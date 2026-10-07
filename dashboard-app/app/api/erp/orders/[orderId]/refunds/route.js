import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { serializeRefundRequest } from '@/features/erp/api/order-serialization';
import { refundRequestStatus, validateRefundAmount } from '@/features/orders/order-refund-utils';
import { prisma } from '@/lib/prisma';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const actor = erpActorLabel(session.user);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const reason = String(body?.reason || '').trim();
  if (reason.length < 8 || reason.length > 500) {
    return Response.json({ error: 'Descreva o motivo do estorno (de 8 a 500 caracteres).' }, { status: 400 });
  }
  const { orderId } = await params;
  if (!String(orderId || '').trim()) return Response.json({ error: 'Código do pedido inválido.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findUnique({
        where: { id: String(orderId).trim() },
        select: {
          id: true,
          total: true,
          refundedAmount: true,
          paymentStatus: true,
          pagarmeChargeId: true,
          refundRequests: { select: { amount: true, status: true } },
        },
      });
      if (!order) return { error: 'Pedido não encontrado.', status: 404 };
      if (!order.pagarmeChargeId || !['paid', 'partially_refunded'].includes(order.paymentStatus)) {
        return { error: 'O estorno parcial via Pagar.me exige uma cobrança confirmada por essa integração.', status: 409 };
      }

      const validation = validateRefundAmount({
        amount: body.amount,
        orderTotal: order.total,
        refundRequests: order.refundRequests,
        refundedAmount: order.refundedAmount,
      });
      if (validation.error) return { error: validation.error, status: 400 };

      const id = randomUUID();
      const refundRequest = await transaction.orderRefundRequest.create({
        data: {
          id,
          code: `EST-${id}`,
          orderId: order.id,
          amount: (validation.amountCents / 100).toFixed(2),
          reason,
          status: refundRequestStatus.requested,
          requestedBy: actor,
          events: {
            create: {
              id: randomUUID(),
              action: refundRequestStatus.requested,
              actor,
              note: 'Estorno parcial registrado manualmente pelo ERP para análise.',
            },
          },
        },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      return { refundRequest };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      request: serializeRefundRequest(result.refundRequest),
      message: 'Estorno parcial registrado. Revise a solicitação e confirme o envio à Pagar.me no ERP.',
    }, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2034') {
      return Response.json({ error: 'O saldo disponível mudou durante a solicitação. Atualize o pedido e tente novamente.' }, { status: 409 });
    }
    console.error('Não foi possível registrar o estorno parcial pelo ERP:', error);
    return Response.json({ error: 'Não foi possível registrar o estorno agora.' }, { status: 500 });
  }
}
