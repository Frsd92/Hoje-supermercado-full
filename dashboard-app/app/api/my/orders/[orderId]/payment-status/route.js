import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getPagarmeOrder, PagarmeApiError } from '@/features/payments/pagarme';
import { prisma } from '@/lib/prisma';
import { isCardPaymentMethod } from '@/features/payments/card-methods';
import { reconcilePendingOrderPayment } from '@/features/orders/pending-payment-reconciliation';

const statusMessages = {
  paid: 'Pagamento confirmado.',
  pending: 'Pagamento aguardando confirmação. Aguarde e consulte novamente; não pague outra vez agora.',
  failed: 'Pagamento não aprovado.',
  canceled: 'Pagamento cancelado.',
  expired: 'O prazo para pagamento venceu sem confirmação. O pedido foi cancelado; inicie um novo pedido para tentar novamente.',
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
    if ((order.paymentMethod !== 'pix' && !isCardPaymentMethod(order.paymentMethod)) || !order.pagarmeOrderId) {
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

    let result;
    try {
      result = await reconcilePendingOrderPayment(order, providerOrder);
    } catch (error) {
      if (/valor da cobrança|não corresponde ao pedido|cobrança do pedido mudou/.test(error.message || '')) {
        return Response.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
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
