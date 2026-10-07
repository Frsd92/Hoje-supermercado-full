import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { amountToCents } from '@/features/orders/order-refund-utils';
import {
  getPagarmeOrder,
  getPagarmePaymentSnapshot,
  getPagarmePaymentStatus,
  getPagarmeRefundedCents,
  PagarmeApiError,
} from '@/features/payments/pagarme';
import { prisma } from '@/lib/prisma';

const statusMessages = {
  paid: 'Pagamento confirmado.',
  pending: 'Pagamento aguardando confirmação. Aguarde e consulte novamente; não pague outra vez agora.',
  failed: 'Pagamento não aprovado.',
  canceled: 'Pagamento cancelado.',
  refunded: 'Estorno confirmado.',
  partially_refunded: 'Estorno parcial confirmado.',
};

export async function POST(_request, { params }) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Entre na sua conta para verificar o pagamento.' }, { status: 401 });

  const { orderId } = await params;
  const normalizedOrderId = String(orderId || '').trim();
  if (!normalizedOrderId) return Response.json({ error: 'Código do pedido inválido.' }, { status: 400 });

  try {
    const order = await prisma.order.findFirst({
      where: {
        id: normalizedOrderId,
        customerEmail: { equals: email, mode: 'insensitive' },
      },
      select: {
        id: true,
        total: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentDetails: true,
        refundedAmount: true,
        pagarmeOrderId: true,
      },
    });
    if (!order) return Response.json({ error: 'Pedido não encontrado na sua conta.' }, { status: 404 });
    if (!['pix', 'cartao'].includes(order.paymentMethod) || !order.pagarmeOrderId) {
      return Response.json({ error: 'Este pedido não possui uma cobrança online para consultar.' }, { status: 409 });
    }
    if (order.paymentStatus !== 'pending') {
      return Response.json({
        paymentStatus: order.paymentStatus,
        updated: false,
        message: 'O pedido já está com o status atualizado.',
      });
    }

    let providerOrder;
    try {
      providerOrder = await getPagarmeOrder(order.pagarmeOrderId);
    } catch (error) {
      if (error instanceof PagarmeApiError && error.status === 404) {
        return Response.json({ error: 'Ainda não localizamos a cobrança deste pedido.' }, { status: 409 });
      }
      console.error('Não foi possível consultar o pagamento na Pagar.me:', error);
      return Response.json({ error: 'Não foi possível consultar o pagamento agora.' }, { status: 503 });
    }

    const providerId = String(providerOrder.id || '');
    const providerCode = String(providerOrder.code || '');
    if (providerId !== order.pagarmeOrderId || providerCode !== order.id) {
      return Response.json({ error: 'A cobrança consultada não corresponde a este pedido.' }, { status: 409 });
    }

    const providerAmountCents = Number(
      providerOrder.amount
      ?? providerOrder.charges?.reduce((total, charge) => total + (Number(charge.amount) || 0), 0),
    );
    const orderTotalCents = amountToCents(order.total);
    if (!Number.isSafeInteger(providerAmountCents) || providerAmountCents !== orderTotalCents) {
      return Response.json({ error: 'O valor da cobrança não corresponde ao total do pedido.' }, { status: 409 });
    }

    const snapshot = getPagarmePaymentSnapshot(providerOrder);
    const refundedCents = getPagarmeRefundedCents(providerOrder);
    const paymentStatus = refundedCents > 0
      ? refundedCents >= orderTotalCents ? 'refunded' : 'partially_refunded'
      : getPagarmePaymentStatus(providerOrder);

    const result = await prisma.$transaction(async (transaction) => {
      const currentOrder = await transaction.order.findFirst({
        where: {
          id: order.id,
          customerEmail: { equals: email, mode: 'insensitive' },
        },
        select: {
          id: true,
          paymentStatus: true,
          paymentDetails: true,
          pagarmeOrderId: true,
        },
      });
      if (!currentOrder) return { error: 'Pedido não encontrado na sua conta.', status: 404 };
      if (currentOrder.paymentStatus !== 'pending') {
        return { paymentStatus: currentOrder.paymentStatus, updated: false };
      }
      if (currentOrder.pagarmeOrderId !== providerId) {
        return { error: 'A cobrança do pedido mudou durante a consulta. Atualize a página.' , status: 409 };
      }

      await transaction.order.update({
        where: { id: currentOrder.id },
        data: {
          pagarmeChargeId: snapshot.pagarmeChargeId || undefined,
          paymentStatus,
          paymentDetails: paymentStatus === 'pending'
            ? snapshot.paymentDetails || currentOrder.paymentDetails || undefined
            : null,
          refundedAmount: (refundedCents / 100).toFixed(2),
        },
      });

      if (['failed', 'canceled'].includes(paymentStatus)) {
        await transaction.couponRedemption.deleteMany({ where: { orderId: currentOrder.id } });
      }

      return { paymentStatus, updated: true };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      paymentStatus: result.paymentStatus,
      updated: result.updated,
      message: statusMessages[result.paymentStatus] || 'Status do pagamento atualizado.',
    });
  } catch (error) {
    if (error?.code === 'P2034') {
      return Response.json({ error: 'O pedido foi atualizado ao mesmo tempo. Atualize a página e confira o status.' }, { status: 409 });
    }
    console.error('Não foi possível atualizar o status do pagamento:', error);
    return Response.json({ error: 'Não foi possível atualizar o pagamento agora.' }, { status: 500 });
  }
}
