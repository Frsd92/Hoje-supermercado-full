import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { serializeServiceRequest } from '@/features/erp/api/order-serialization';
import {
  canRequestOrderService,
  hasOpenOrderServiceRequest,
  isOrderServiceRequestType,
  orderServiceRequestStatus,
} from '@/features/orders/order-service-request-utils';
import { prisma } from '@/lib/prisma';

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Entre na sua conta para solicitar atendimento do pedido.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const type = String(body?.type || '');
  if (!isOrderServiceRequestType(type)) {
    return Response.json({ error: 'Escolha se deseja solicitar cancelamento ou troca.' }, { status: 400 });
  }
  const reason = String(body?.reason || '').trim();
  if (reason.length < 8 || reason.length > 500) {
    return Response.json({ error: 'Descreva o motivo (de 8 a 500 caracteres).' }, { status: 400 });
  }
  const replacementProduct = String(body?.replacementProduct || '').trim();
  if (type === 'exchange' && (replacementProduct.length < 2 || replacementProduct.length > 160)) {
    return Response.json({ error: 'Informe o produto desejado para a troca (de 2 a 160 caracteres).' }, { status: 400 });
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
          status: true,
          items: { select: { id: true, name: true } },
          serviceRequests: {
            where: { status: orderServiceRequestStatus.requested },
            select: { type: true },
          },
        },
      });
      if (!order) return { error: 'O pedido não foi encontrado na sua conta.', status: 404 };
      if (!canRequestOrderService(order, type)) {
        return {
          error: type === 'cancellation'
            ? 'O pedido já está em trânsito, concluído ou cancelado e não aceita solicitação de cancelamento.'
            : 'Este pedido não aceita novas solicitações de troca.',
          status: 409,
        };
      }
      if (hasOpenOrderServiceRequest(order.serviceRequests, type)) {
        return { error: 'Já existe uma solicitação deste tipo aguardando atendimento para este pedido.', status: 409 };
      }

      const orderItemId = String(body?.orderItemId || '').trim();
      const orderItem = type === 'exchange'
        ? order.items.find((item) => item.id === orderItemId)
        : null;
      if (type === 'exchange' && !orderItem) {
        return { error: 'Selecione um item deste pedido para solicitar a troca.', status: 400 };
      }

      const id = randomUUID();
      const serviceRequest = await transaction.orderServiceRequest.create({
        data: {
          id,
          code: `SOL-${id}`,
          orderId: order.id,
          type,
          reason,
          orderItemId: orderItem?.id || null,
          orderItemName: orderItem?.name || null,
          replacementProduct: type === 'exchange' ? replacementProduct : null,
          status: orderServiceRequestStatus.requested,
          requestedBy: email,
        },
      });
      return { serviceRequest };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      serviceRequest: serializeServiceRequest(result.serviceRequest),
      message: 'Solicitação registrada e enviada para análise da loja.',
    }, { status: 201 });
  } catch (error) {
    if (error?.code === 'P2034') {
      return Response.json({ error: 'O pedido foi atualizado durante a solicitação. Atualize a página e tente novamente.' }, { status: 409 });
    }
    console.error('Não foi possível registrar a solicitação do pedido:', error);
    return Response.json({ error: 'Não foi possível registrar a solicitação agora.' }, { status: 500 });
  }
}
