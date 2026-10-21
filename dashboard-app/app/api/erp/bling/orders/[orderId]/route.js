import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { BlingIntegrationError, sendOrderToBling } from '@/features/erp/api/bling';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const { orderId } = await params;
  if (!orderId || orderId.length > 120) return Response.json({ error: 'Identificador do pedido inválido.' }, { status: 400, headers });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Confirme a operação antes de enviar o pedido.' }, { status: 400, headers });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  let order;
  try {
    order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
  } catch (error) {
    console.error('Não foi possível carregar o pedido para envio ao Bling:', error);
    return Response.json({ error: 'Não foi possível carregar o pedido.' }, { status: 500, headers });
  }
  if (!order) return Response.json({ error: 'Pedido não encontrado.' }, { status: 404, headers });
  if (order.blingSalesOrderId) {
    return Response.json({ error: 'Este pedido já foi enviado ao Bling.' }, { status: 409, headers });
  }
  if (order.status === 'Cancelado'
    || ['failed', 'canceled', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
    return Response.json({ error: 'Pedidos cancelados, recusados ou estornados não podem ser enviados ao Bling.' }, { status: 409, headers });
  }
  if (order.paymentStatus === 'pending') {
    return Response.json({ error: 'O pedido está aguardando pagamento e não pode ser enviado ao Bling.' }, { status: 409, headers });
  }

  const checkedForDuplicate = body.confirmNoOrderFound === true;
  if (order.blingSyncStatus === 'sending') {
    const startedAt = order.blingSyncStartedAt?.getTime() || 0;
    if (startedAt && Date.now() - startedAt > 5 * 60 * 1000) {
      try {
        await prisma.order.updateMany({
          where: { id: order.id, blingSyncStatus: 'sending', blingSyncStartedAt: order.blingSyncStartedAt },
          data: {
            blingSyncStatus: 'uncertain',
            blingSyncError: 'A tentativa de envio expirou sem confirmação do Bling.',
            blingSyncStartedAt: null,
          },
        });
      } catch (error) {
        console.error('Não foi possível atualizar o estado da tentativa expirada do Bling:', error);
        return Response.json({ error: 'Não foi possível verificar a tentativa anterior. Atualize a página e tente novamente.' }, { status: 500, headers });
      }
      return Response.json({
        error: 'A tentativa anterior não foi concluída. Confira no Bling antes de liberar um novo envio.',
      }, { status: 409, headers });
    }
    return Response.json({ error: 'O envio deste pedido ao Bling já está em andamento.' }, { status: 409, headers });
  }
  if (order.blingSyncStatus === 'uncertain' && !checkedForDuplicate) {
    return Response.json({
      error: 'O resultado do envio anterior é incerto. Confira no Bling antes de qualquer nova tentativa.',
    }, { status: 409, headers });
  }
  if (order.blingSyncStatus === 'uncertain' && checkedForDuplicate) {
    let reset;
    try {
      reset = await prisma.order.updateMany({
        where: { id: order.id, blingSalesOrderId: null, blingSyncStatus: 'uncertain' },
        data: { blingSyncStatus: 'failed', blingSyncStartedAt: null },
      });
    } catch (error) {
      console.error('Não foi possível liberar a tentativa revisada do Bling:', error);
      return Response.json({ error: 'Não foi possível liberar uma nova tentativa. Atualize o pedido e tente novamente.' }, { status: 500, headers });
    }
    if (!reset.count) return Response.json({ error: 'O estado do pedido mudou. Atualize a fila e confira o Bling novamente.' }, { status: 409, headers });
  }

  let claim;
  try {
    claim = await prisma.order.updateMany({
      where: { id: order.id, blingSalesOrderId: null, blingSyncStatus: { notIn: ['sending', 'uncertain'] } },
      data: { blingSyncStatus: 'sending', blingSyncError: null, blingSyncStartedAt: new Date() },
    });
  } catch (error) {
    console.error('Não foi possível reservar o pedido para envio ao Bling:', error);
    return Response.json({ error: 'Não foi possível iniciar o envio do pedido.' }, { status: 500, headers });
  }
  if (!claim.count) return Response.json({ error: 'O pedido já está sendo enviado ou já foi enviado ao Bling.' }, { status: 409, headers });

  let response;
  try {
    response = await sendOrderToBling(order);
  } catch (error) {
    const uncertain = error instanceof BlingIntegrationError && error.uncertain === true;
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o pedido ao Bling.';
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          blingSyncStatus: uncertain ? 'uncertain' : 'failed',
          blingSyncError: message.slice(0, 500),
          blingSyncStartedAt: null,
        },
      });
    } catch (saveError) {
      console.error('Não foi possível salvar o resultado da tentativa de envio ao Bling:', saveError);
    }
    console.error('Não foi possível enviar o pedido ao Bling:', {
      status: error instanceof BlingIntegrationError ? error.status : 502,
      uncertain,
    });
    return Response.json({ error: message }, {
      status: error instanceof BlingIntegrationError ? error.status : 502,
      headers,
    });
  }

  const salesOrder = response?.data;
  if (!salesOrder?.id) {
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          blingSyncStatus: 'uncertain',
          blingSyncError: 'O Bling respondeu sem confirmar o identificador do pedido criado.',
          blingSyncStartedAt: null,
        },
      });
    } catch (error) {
      console.error('Não foi possível registrar a resposta incompleta do Bling:', error);
    }
    return Response.json({
      error: 'O Bling não confirmou o identificador do pedido. Confira a conta Bling antes de tentar novamente.',
    }, { status: 502, headers });
  }

  try {
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        blingSalesOrderId: String(salesOrder.id),
        blingSalesOrderNumber: salesOrder.numero === undefined ? null : String(salesOrder.numero),
        blingSyncedAt: new Date(),
        blingSyncStatus: 'sent',
        blingSyncError: null,
        blingSyncStartedAt: null,
      },
      select: { blingSalesOrderId: true, blingSalesOrderNumber: true, blingSyncedAt: true },
    });
    return Response.json({
      order: {
        ...updatedOrder,
        blingSyncedAt: updatedOrder.blingSyncedAt.toISOString(),
      },
      message: 'Pedido de venda criado no Bling para revisão. Nenhuma NF-e foi emitida.',
    }, { headers });
  } catch (error) {
    console.error('O pedido foi criado no Bling, mas não foi possível salvar a referência local:', error);
    return Response.json({
      error: 'O pedido pode ter sido criado no Bling, mas não foi possível registrar a confirmação. Confira no Bling antes de tentar novamente.',
    }, { status: 502, headers });
  }
}
