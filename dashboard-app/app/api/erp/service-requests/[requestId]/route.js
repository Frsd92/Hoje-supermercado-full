import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { serializeServiceRequest } from '@/features/erp/api/order-serialization';
import {
  canApproveOrderServiceRequest,
  orderServiceRequestStatus,
  orderServiceRequestType,
} from '@/features/orders/order-service-request-utils';
import { prisma } from '@/lib/prisma';

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

  const action = body?.action === 'approve' ? 'approve' : body?.action === 'reject' ? 'reject' : '';
  if (!action) return Response.json({ error: 'A decisão deve ser atender ou recusar a solicitação.' }, { status: 400 });
  const note = String(body?.note || '').trim();
  if (note.length < 8 || note.length > 500) {
    return Response.json({ error: 'Registre uma observação de atendimento (de 8 a 500 caracteres).' }, { status: 400 });
  }

  const { requestId } = await params;
  if (!String(requestId || '').trim()) return Response.json({ error: 'Código da solicitação inválido.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const current = await transaction.orderServiceRequest.findUnique({
        where: { id: String(requestId).trim() },
        include: { order: { select: { id: true, status: true, paymentStatus: true } } },
      });
      if (!current) return { error: 'Solicitação não encontrada.', status: 404 };
      if (current.status !== orderServiceRequestStatus.requested) {
        return { error: 'Esta solicitação já foi atendida ou recusada.', status: 409 };
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

      if (action === 'approve' && current.type === orderServiceRequestType.cancellation) {
        const updatedOrder = await transaction.order.updateMany({
          where: { id: current.order.id, status: current.order.status },
          data: { status: 'Cancelado', updatedBy: actor },
        });
        if (updatedOrder.count !== 1) throw new ServiceRequestConflictError('O pedido foi atualizado durante o atendimento.');
      }

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

      const serviceRequest = await transaction.orderServiceRequest.findUnique({ where: { id: current.id } });
      return {
        serviceRequest,
        orderStatus: action === 'approve' && current.type === orderServiceRequestType.cancellation
          ? 'Cancelado'
          : current.order.status,
      };
    }, { isolationLevel: 'Serializable' });

    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    const cancellationMessage = action === 'approve' && result.orderStatus === 'Cancelado'
      ? 'Pedido marcado como cancelado. O estorno financeiro não é automático e, se devido, deve ser processado separadamente no ERP.'
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
