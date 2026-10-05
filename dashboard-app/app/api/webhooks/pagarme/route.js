import { getPagarmeOrder, getPagarmePaymentSnapshot, getPagarmeRefundedCents, PagarmeApiError } from '@/features/payments/pagarme';
import { amountToCents, refundRequestStatus } from '@/features/orders/order-refund-utils';
import { prisma } from '@/lib/prisma';

const maximumWebhookBytes = 64 * 1024;

export async function POST(request) {
  if (!process.env.PAGARME_SECRET_KEY) {
    return Response.json({ error: 'Webhook Pagar.me não configurado.' }, { status: 503 });
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maximumWebhookBytes) {
    return Response.json({ error: 'Notificação muito grande.' }, { status: 413 });
  }

  let event;
  try {
    event = await request.json();
  } catch {
    return Response.json({ error: 'Notificação inválida.' }, { status: 400 });
  }
  const eventId = String(event?.id || '').trim();
  const eventType = String(event?.type || '').trim();
  const dataId = String(event?.data?.id || '').trim();
  const internalOrderId = String(event?.data?.code || event?.data?.metadata?.internal_order_id || '').trim();
  if (!eventId || eventId.length > 100 || !eventType || eventType.length > 100 || !dataId) {
    return Response.json({ error: 'Notificação incompleta.' }, { status: 400 });
  }

  let localOrder;
  try {
    localOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { pagarmeOrderId: dataId },
          { pagarmeChargeId: dataId },
          ...(internalOrderId ? [{ id: internalOrderId }] : []),
        ],
      },
      include: {
        refundRequests: { orderBy: { createdAt: 'asc' } },
      },
    });
  } catch (error) {
    console.error('Não foi possível localizar o pedido relacionado ao webhook Pagar.me:', error);
    return Response.json({ error: 'Não foi possível processar a notificação agora.' }, { status: 500 });
  }
  if (!localOrder) return Response.json({ received: true });

  const providerOrderId = eventType.startsWith('order.')
    ? dataId
    : localOrder.pagarmeOrderId || String(event?.data?.order_id || event?.data?.order?.id || '');
  if (!providerOrderId) return Response.json({ received: true });

  let providerOrder;
  try {
    providerOrder = await getPagarmeOrder(providerOrderId);
  } catch (error) {
    if (error instanceof PagarmeApiError && error.status === 404) return Response.json({ received: true });
    console.error('Não foi possível verificar o evento na API autenticada da Pagar.me:', error);
    return Response.json({ error: 'Não foi possível confirmar a notificação com a Pagar.me.' }, { status: 503 });
  }
  if (String(providerOrder.id || '') !== providerOrderId) {
    return Response.json({ error: 'A notificação não corresponde ao pedido consultado.' }, { status: 400 });
  }

  const charges = Array.isArray(providerOrder.charges) ? providerOrder.charges : [];
  if (eventType.startsWith('charge.')
    && !charges.some((charge) => String(charge.id || '') === dataId)) {
    return Response.json({ received: true });
  }
  if (String(providerOrder.code || '') !== localOrder.id
    && providerOrder.id !== localOrder.pagarmeOrderId
    && !charges.some((charge) => String(charge.id || '') === localOrder.pagarmeChargeId)) {
    return Response.json({ received: true });
  }

  const snapshot = getPagarmePaymentSnapshot(providerOrder);
  const refundedCents = eventType === 'charge.refunded'
    ? getPagarmeRefundedCents(providerOrder)
    : amountToCents(localOrder.refundedAmount);
  const orderTotalCents = amountToCents(localOrder.total);
  const paymentStatus = refundedCents > 0
    ? refundedCents >= orderTotalCents ? 'refunded' : 'partially_refunded'
    : snapshot.paymentStatus;
  const refundAmount = (refundedCents / 100).toFixed(2);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existingEvent = await transaction.pagarmeWebhookEvent.findUnique({ where: { id: eventId } });
      if (existingEvent) return { duplicate: true };

      await transaction.pagarmeWebhookEvent.create({
        data: { id: eventId, eventType, orderId: localOrder.id },
      });
      await transaction.order.update({
        where: { id: localOrder.id },
        data: {
          pagarmeOrderId: providerOrderId,
          pagarmeChargeId: snapshot.pagarmeChargeId || localOrder.pagarmeChargeId,
          paymentStatus,
          paymentDetails: paymentStatus === 'pending'
            ? snapshot.paymentDetails || localOrder.paymentDetails || undefined
            : null,
          refundedAmount: refundAmount,
        },
      });

      if (['failed', 'canceled'].includes(paymentStatus)) {
        await transaction.couponRedemption.deleteMany({ where: { orderId: localOrder.id } });
      }

      let confirmedRefundCents = Math.max(0, refundedCents - amountToCents(localOrder.refundedAmount));
      const pendingRefunds = localOrder.refundRequests.filter((refund) => [
        refundRequestStatus.gatewayProcessing,
        refundRequestStatus.approvedWaitingGateway,
      ].includes(refund.status));
      for (const refund of pendingRefunds) {
        const requestCents = amountToCents(refund.amount);
        if (requestCents <= 0 || requestCents > confirmedRefundCents) continue;
        await transaction.orderRefundRequest.update({
          where: { id: refund.id },
          data: { status: refundRequestStatus.completed },
        });
        await transaction.orderRefundEvent.create({
          data: {
            id: `${eventId}-${refund.id}`.slice(0, 191),
            refundRequestId: refund.id,
            action: refundRequestStatus.completed,
            actor: 'Pagar.me',
            note: 'Estorno confirmado pela consulta autenticada à Pagar.me.',
          },
        });
        confirmedRefundCents -= requestCents;
      }

      return { duplicate: false };
    });
    return Response.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    if (error?.code === 'P2002' && error.meta?.modelName === 'PagarmeWebhookEvent') {
      return Response.json({ received: true, duplicate: true });
    }
    console.error('Não foi possível aplicar a confirmação do webhook Pagar.me:', error);
    return Response.json({ error: 'Não foi possível registrar a notificação agora.' }, { status: 500 });
  }
}
