import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { serializeServiceRequest } from '@/features/erp/api/order-serialization';
import { processPagarmeRefund } from '@/features/erp/api/pagarme-refund-processing';
import {
  canApproveOrderServiceRequest,
  orderServiceRequestStatus,
  orderServiceRequestType,
} from '@/features/orders/order-service-request-utils';
import { getRemainingRefundCents, refundRequestStatus } from '@/features/orders/order-refund-utils';
import { isCardPaymentMethod } from '@/features/payments/card-methods';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

class ServiceRequestConflictError extends Error {}

export async function PATCH(request, { params }) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const actor = erpActorLabel(session.user);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const action = ['approve', 'reject', 'refund'].includes(body?.action) ? body.action : '';
  if (!action) return Response.json({ error: 'Ação inválida para esta solicitação.' }, { status: 400 });
  const note = String(body?.note || '').trim();
  if (note.length > 500 || (action !== 'refund' && note.length < 8)) {
    return Response.json({ error: action === 'refund'
      ? 'A observação pode ter no máximo 500 caracteres.'
      : 'Registre uma observação de atendimento (de 8 a 500 caracteres).' }, { status: 400 });
  }

  const { requestId } = await params;
  if (!String(requestId || '').trim()) return Response.json({ error: 'Código da solicitação inválido.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.orderServiceRequest.findUnique({
        where: { id: String(requestId).trim() },
        include: {
          order: {
            select: {
              id: true,
              status: true,
              paymentStatus: true,
              paymentMethod: true,
              total: true,
              refundedAmount: true,
              pagarmeChargeId: true,
              refundRequests: { select: { amount: true, status: true } },
            },
          },
        },
      });
      if (!current) return { error: 'Solicitação não encontrada.', status: 404 };
      const refundOnly = action === 'refund';
      if (refundOnly
        ? current.status !== orderServiceRequestStatus.approved
        : current.status !== orderServiceRequestStatus.requested) {
        return { error: 'Esta solicitação já foi atendida ou recusada.', status: 409 };
      }
      if (refundOnly && (current.type !== orderServiceRequestType.cancellation || current.order.status !== 'Cancelado')) {
        return { error: 'O estorno automático só está disponível para cancelamentos já aprovados.', status: 409 };
      }
      if (action === 'approve' && !canApproveOrderServiceRequest({
        type: current.type,
        status: current.status,
        orderStatus: current.order.status,
      })) {
        return { error: 'Não é possível aprovar o cancelamento depois que o pedido entrou em trânsito ou foi concluído.', status: 409 };
      }

      const nextStatus = action === 'approve'
        ? orderServiceRequestStatus.approved
        : orderServiceRequestStatus.rejected;
      let refundRequestId = '';
      const onlinePayment = current.order.paymentMethod === 'pix'
        || isCardPaymentMethod(current.order.paymentMethod);

      const cancellation = (action === 'approve' || refundOnly)
        && current.type === orderServiceRequestType.cancellation;
      const paidPagarmeOrder = cancellation
        && onlinePayment
        && ['paid', 'partially_refunded'].includes(current.order.paymentStatus);
      if (refundOnly && !paidPagarmeOrder) {
        return { error: 'O pedido não possui pagamento confirmado pela Pagar.me para estornar automaticamente.', status: 409 };
      }

      if (cancellation) {
        if (paidPagarmeOrder && !current.order.pagarmeChargeId) {
          return { error: 'Não é possível estornar automaticamente: falta o identificador da cobrança Pagar.me.', status: 409 };
        }

        const outstandingRefund = current.order.refundRequests.some((refund) => [
          refundRequestStatus.requested,
          refundRequestStatus.approvedWaitingGateway,
          refundRequestStatus.gatewayProcessing,
          refundRequestStatus.gatewayFailed,
        ].includes(refund.status));
        if (paidPagarmeOrder && outstandingRefund) {
          return { error: 'Conclua ou recuse a solicitação de estorno já aberta antes de continuar, para evitar uma devolução duplicada.', status: 409 };
        }

        const remainingRefundCents = paidPagarmeOrder
          ? getRemainingRefundCents(current.order.total, current.order.refundRequests, current.order.refundedAmount)
          : 0;
        if (remainingRefundCents > 0) {
          refundRequestId = randomUUID();
          await transaction.orderRefundRequest.create({
            data: {
              id: refundRequestId,
              code: `EST-${refundRequestId}`,
              orderId: current.order.id,
              amount: (remainingRefundCents / 100).toFixed(2),
              reason: `Estorno automático pelo cancelamento: ${current.reason}`.slice(0, 500),
              status: refundRequestStatus.requested,
              requestedBy: actor,
              events: {
                create: {
                  id: randomUUID(),
                  action: refundRequestStatus.requested,
                  actor,
                  note: 'Estorno do saldo restante criado automaticamente após aprovação do cancelamento.',
                },
              },
            },
          });
        } else if (paidPagarmeOrder) {
          return { error: 'O pedido já está integralmente estornado.', status: 409 };
        }

        if (!refundOnly) {
          const updatedOrder = await transaction.order.updateMany({
            where: { id: current.order.id, status: current.order.status },
            data: { status: 'Cancelado', updatedBy: actor },
          });
          if (updatedOrder.count !== 1) throw new ServiceRequestConflictError('O pedido foi atualizado durante o atendimento.');
        }
      }

      if (!refundOnly) {
        const update = await transaction.orderServiceRequest.updateMany({
          where: { id: current.id, status: orderServiceRequestStatus.requested },
          data: {
            status: nextStatus,
            reviewedBy: actor,
            reviewedAt: new Date(),
            decisionNote: note,
          },
        });
        if (update.count !== 1) throw new ServiceRequestConflictError('A solicitação foi atualizada durante o atendimento.');
      }

      const serviceRequest = await transaction.orderServiceRequest.findUnique({ where: { id: current.id } });
      return {
        serviceRequest,
        refundRequestId,
        orderStatus: cancellation
          ? 'Cancelado'
          : current.order.status,
        refundOnly,
        onlinePayment,
        paymentStatus: current.order.paymentStatus,
      };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    if (result.refundRequestId) {
      const refundResponse = await processPagarmeRefund(result.refundRequestId, actor, note);
      if (!refundResponse) {
        return Response.json({
          serviceRequest: serializeServiceRequest(result.serviceRequest),
          orderStatus: result.orderStatus,
          error: 'O pedido foi cancelado, mas o estorno não foi iniciado. Tente novamente pelo rastreio de estornos no ERP.',
        }, { status: 502 });
      }
      const refundData = await refundResponse.json();
      const refundMessage = refundData.error || refundData.message || 'A solicitação de estorno foi processada.';
      return Response.json({
        serviceRequest: serializeServiceRequest(result.serviceRequest),
        orderStatus: result.orderStatus,
        refundRequest: refundData.request || null,
        message: `${result.refundOnly ? 'Pedido já cancelado.' : 'Pedido cancelado.'} ${refundMessage}`,
        ...(refundData.error ? { error: refundData.error } : {}),
      }, { status: refundResponse.status });
    }

    const cancellationMessage = action === 'approve' && result.orderStatus === 'Cancelado'
      ? result.onlinePayment && result.paymentStatus === 'refunded'
        ? 'Pedido cancelado. O pagamento já estava integralmente estornado.'
        : result.onlinePayment && ['pending', 'failed', 'canceled'].includes(result.paymentStatus)
          ? 'Pedido cancelado. O pagamento não estava confirmado, então não houve devolução financeira.'
          : 'Pedido cancelado. Se o pagamento foi feito fora da Pagar.me, a devolução deve ser processada manualmente.'
      : action === 'approve'
        ? 'Atendimento registrado. A troca física deve ser conferida e operada pela equipe.'
        : 'Solicitação recusada e registrada.';
    return Response.json({
      request: serializeServiceRequest(result.serviceRequest),
      orderStatus: result.orderStatus,
      message: cancellationMessage,
    });
  } catch (error) {
    if (error instanceof ServiceRequestConflictError || error?.code === 'P2034') {
      return Response.json({ error: error.message || 'A solicitação ou o pedido foi atualizado durante o atendimento.' }, { status: 409 });
    }
    console.error('Não foi possível atualizar a solicitação do pedido:', error);
    return Response.json({ error: 'Não foi possível atualizar a solicitação agora.' }, { status: 500 });
  }
}
