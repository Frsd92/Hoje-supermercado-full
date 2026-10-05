import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { serializeRefundRequest } from '@/features/erp/api/order-serialization';
import { amountToCents, refundRequestStatus, validateRefundAmount } from '@/features/orders/order-refund-utils';
import { PagarmeApiError, refundPagarmeCharge } from '@/features/payments/pagarme';
import { prisma } from '@/lib/prisma';

async function requestPagarmeRefund(refundId, actor, note) {
  let refundRequest;
  try {
    refundRequest = await prisma.orderRefundRequest.findUnique({
      where: { id: refundId },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            paymentStatus: true,
            pagarmeChargeId: true,
            refundedAmount: true,
            refundRequests: { select: { id: true, amount: true, status: true } },
          },
        },
      },
    });
  } catch (error) {
    console.error('Não foi possível carregar o pedido para solicitar o estorno Pagar.me:', error);
    return Response.json({ error: 'Não foi possível carregar o pedido para estorno agora.' }, { status: 500 });
  }
  if (!refundRequest) return Response.json({ error: 'Solicitação de estorno não encontrada.' }, { status: 404 });

  const order = refundRequest.order;
  if (!order.pagarmeChargeId || !['paid', 'partially_refunded'].includes(order.paymentStatus)) return null;
  if (![refundRequestStatus.requested, refundRequestStatus.gatewayFailed, refundRequestStatus.approvedWaitingGateway].includes(refundRequest.status)) {
    return Response.json({ error: 'Esta solicitação já está sendo processada ou foi concluída.' }, { status: 409 });
  }

  const otherRequests = order.refundRequests.filter((request) => request.id !== refundRequest.id);
  const amountValidation = validateRefundAmount({
    amount: refundRequest.amount,
    orderTotal: order.total,
    refundRequests: otherRequests,
    refundedAmount: order.refundedAmount,
  });
  if (amountValidation.error) return Response.json({ error: amountValidation.error }, { status: 409 });

  let processingRequest;
  try {
    processingRequest = await prisma.$transaction(async (transaction) => {
      const update = await transaction.orderRefundRequest.updateMany({
        where: { id: refundRequest.id, status: refundRequest.status },
        data: {
          status: refundRequestStatus.gatewayProcessing,
          reviewedBy: actor,
          reviewedAt: new Date(),
          decisionNote: note || null,
        },
      });
      if (update.count !== 1) return null;
      await transaction.orderRefundEvent.create({
        data: {
          id: randomUUID(),
          refundRequestId: refundRequest.id,
          action: refundRequestStatus.gatewayProcessing,
          actor,
          note: note || 'Aprovação registrada; enviando o estorno à Pagar.me.',
        },
      });
      return transaction.orderRefundRequest.findUnique({
        where: { id: refundRequest.id },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
    });
  } catch (error) {
    console.error('Não foi possível reservar a solicitação antes de enviar o estorno:', error);
    return Response.json({ error: 'Não foi possível iniciar o estorno agora.' }, { status: 500 });
  }
  if (!processingRequest) return Response.json({ error: 'Esta solicitação foi atualizada por outra operação.' }, { status: 409 });

  const amountCents = amountToCents(refundRequest.amount);
  try {
    const gatewayCharge = await refundPagarmeCharge(
      order.pagarmeChargeId,
      amountCents,
      randomUUID(),
    );
    const canceledCents = Number(gatewayCharge.canceled_amount) || 0;
    const expectedCents = amountToCents(order.refundedAmount) + amountCents;
    const gatewayStatus = String(gatewayCharge.status || '').toLowerCase();
    const confirmed = canceledCents >= expectedCents && !['pending', 'pending_refund', 'processing'].includes(gatewayStatus);

    const result = await prisma.$transaction(async (transaction) => {
      if (confirmed) {
        const orderTotalCents = amountToCents(order.total);
        await transaction.order.update({
          where: { id: order.id },
          data: {
            refundedAmount: (canceledCents / 100).toFixed(2),
            paymentStatus: canceledCents >= orderTotalCents ? 'refunded' : 'partially_refunded',
          },
        });
      }
      const current = await transaction.orderRefundRequest.findUnique({
        where: { id: refundRequest.id },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      if (!current || current.status !== refundRequestStatus.gatewayProcessing) return current;
      if (confirmed) {
        await transaction.orderRefundRequest.update({
          where: { id: refundRequest.id },
          data: { status: refundRequestStatus.completed },
        });
      }
      await transaction.orderRefundEvent.create({
        data: {
          id: randomUUID(),
          refundRequestId: refundRequest.id,
          action: confirmed ? refundRequestStatus.completed : refundRequestStatus.gatewayProcessing,
          actor: 'Pagar.me',
          note: confirmed
            ? 'Estorno confirmado pela Pagar.me.'
            : 'Estorno enviado à Pagar.me; aguardando confirmação pelo webhook.',
        },
      });
      return transaction.orderRefundRequest.findUnique({
        where: { id: refundRequest.id },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
    });
    if (!result) throw new Error('A solicitação não foi encontrada após o envio do estorno.');
    return Response.json({
      request: serializeRefundRequest(result),
      message: result.status === refundRequestStatus.completed
        ? 'Estorno confirmado pela Pagar.me e registrado no histórico.'
        : 'Solicitação enviada à Pagar.me. O pedido aguarda confirmação do estorno.',
    }, { status: result.status === refundRequestStatus.completed ? 200 : 202 });
  } catch (error) {
    const definitiveFailure = error instanceof PagarmeApiError
      && [400, 401, 403, 404, 422].includes(error.status);
    console.error('Não foi possível concluir o estorno Pagar.me:', error instanceof PagarmeApiError ? error.status : error);
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const update = await transaction.orderRefundRequest.updateMany({
          where: { id: refundRequest.id, status: refundRequestStatus.gatewayProcessing },
          data: definitiveFailure ? { status: refundRequestStatus.gatewayFailed } : {},
        });
        if (update.count === 1) {
          await transaction.orderRefundEvent.create({
            data: {
              id: randomUUID(),
              refundRequestId: refundRequest.id,
              action: definitiveFailure ? refundRequestStatus.gatewayFailed : refundRequestStatus.gatewayProcessing,
              actor: 'Pagar.me',
              note: definitiveFailure
                ? 'A Pagar.me recusou o estorno; a solicitação foi mantida para nova tentativa.'
                : 'Não foi possível confirmar a resposta da Pagar.me; aguarde o webhook antes de tentar novamente.',
            },
          });
        }
        return transaction.orderRefundRequest.findUnique({
          where: { id: refundRequest.id },
          include: { events: { orderBy: { createdAt: 'asc' } } },
        });
      });
      if (!result) throw new Error('A solicitação não foi encontrada após a falha do estorno.');
      return Response.json({
        request: serializeRefundRequest(result),
        error: definitiveFailure
          ? 'A Pagar.me recusou o estorno. Corrija o motivo e tente novamente.'
          : 'O resultado do estorno ainda não foi confirmado. Aguarde a atualização antes de tentar novamente.',
      }, { status: definitiveFailure ? 502 : 202 });
    } catch (persistError) {
      console.error('Não foi possível registrar o resultado do estorno Pagar.me:', persistError);
      return Response.json({ error: 'O resultado do estorno não pôde ser registrado. Verifique o pedido antes de tentar novamente.' }, { status: 500 });
    }
  }
}

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const action = String(body?.action || '');
  const note = String(body?.note || '').trim();
  if (!['approve', 'reject'].includes(action)) {
    return Response.json({ error: 'Escolha uma decisão válida para esta solicitação.' }, { status: 400 });
  }
  if (note.length > 500 || (action === 'reject' && note.length < 8)) {
    return Response.json({ error: action === 'reject'
      ? 'Informe o motivo da recusa (de 8 a 500 caracteres).'
      : 'A observação pode ter no máximo 500 caracteres.' }, { status: 400 });
  }

  const { refundId } = await params;
  if (!String(refundId || '').trim()) return Response.json({ error: 'Código da solicitação inválido.' }, { status: 400 });
  const nextStatus = action === 'approve'
    ? refundRequestStatus.approvedWaitingGateway
    : refundRequestStatus.rejected;
  const actor = erpActorLabel(session.user);
  if (action === 'approve') {
    const gatewayResponse = await requestPagarmeRefund(String(refundId).trim(), actor, note);
    if (gatewayResponse) return gatewayResponse;
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.orderRefundRequest.findUnique({
        where: { id: String(refundId).trim() },
        select: { id: true, status: true },
      });
      if (!existing) return { error: 'Solicitação de estorno não encontrada.', status: 404 };
      if (existing.status !== refundRequestStatus.requested) {
        return { error: 'Esta solicitação já foi analisada. Atualize a lista antes de continuar.', status: 409 };
      }

      const updated = await transaction.orderRefundRequest.updateMany({
        where: { id: existing.id, status: refundRequestStatus.requested },
        data: {
          status: nextStatus,
          reviewedBy: actor,
          reviewedAt: new Date(),
          decisionNote: note || null,
        },
      });
      if (updated.count !== 1) {
        return { error: 'Esta solicitação foi atualizada por outra operação. Atualize a lista.', status: 409 };
      }

      await transaction.orderRefundEvent.create({
        data: {
          id: randomUUID(),
          refundRequestId: existing.id,
          action: nextStatus,
          actor,
          note: note || (action === 'approve' ? 'Aprovado para encaminhamento manual; nenhum estorno automático foi executado.' : null),
        },
      });

      const refundRequest = await transaction.orderRefundRequest.findUnique({
        where: { id: existing.id },
        include: { events: { orderBy: { createdAt: 'asc' } } },
      });
      return { refundRequest };
    });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      request: serializeRefundRequest(result.refundRequest),
      message: nextStatus === refundRequestStatus.approvedWaitingGateway
        ? 'Solicitação aprovada para tratamento manual. Nenhum estorno automático foi executado.'
        : 'Solicitação recusada e decisão registrada no histórico.',
    });
  } catch (error) {
    console.error('Não foi possível atualizar a solicitação de estorno:', error);
    return Response.json({ error: 'Não foi possível atualizar a solicitação agora.' }, { status: 500 });
  }
}
