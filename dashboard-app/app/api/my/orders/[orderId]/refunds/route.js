import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import { serializeRefundRequest } from '@/features/erp/api/order-serialization';
import { refundRequestStatus, validateRefundAmount } from '@/features/orders/order-refund-utils';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Login necessário para solicitar um estorno.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const reason = String(body?.reason || '').trim();
  if (reason.length < 8 || reason.length > 500) {
    return Response.json({ error: 'Descreva o motivo do pedido de estorno (de 8 a 500 caracteres).' }, { status: 400 });
  }

  const { orderId } = await params;
  if (!String(orderId || '').trim()) return Response.json({ error: 'Código do pedido inválido.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const order = await transaction.order.findFirst({
        where: {
          id: String(orderId).trim(),
          customerEmail: { equals: email, mode: 'insensitive' },
        },
        select: {
          id: true,
          total: true,
          refundedAmount: true,
          paymentStatus: true,
          paymentMethod: true,
          refundRequests: { select: { amount: true, status: true } },
        },
      });
      if (!order) return { error: 'O pedido não foi encontrado na sua conta.', status: 404 };
      if (['pix', 'cartao'].includes(order.paymentMethod)
        && order.paymentStatus !== 'manual'
        && !['paid', 'partially_refunded'].includes(order.paymentStatus)) {
        return { error: 'Só é possível solicitar estorno depois que o pagamento estiver confirmado.', status: 409 };
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
          requestedBy: email,
          events: {
            create: {
              id: randomUUID(),
              action: refundRequestStatus.requested,
              actor: email,
              note: 'Solicitação registrada pelo cliente.',
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
      message: 'Solicitação registrada. Nenhum valor foi estornado; o pedido aguarda análise da loja e integração de pagamento.',
    }, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2034') {
      return Response.json({ error: 'O limite disponível mudou durante a solicitação. Atualize o pedido e tente novamente.' }, { status: 409 });
    }
    console.error('Não foi possível registrar a solicitação de estorno:', error);
    return Response.json({ error: 'Não foi possível registrar a solicitação agora.' }, { status: 500 });
  }
}
