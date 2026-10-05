import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { serializeRefundRequest } from '@/features/erp/api/order-serialization';
import { refundRequestStatus } from '@/features/orders/order-refund-utils';
import { prisma } from '@/lib/prisma';

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
          note: note || (action === 'approve' ? 'Aprovado; aguardando integração da gateway.' : null),
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
        ? 'Solicitação aprovada e aguardando integração. Nenhum valor foi estornado.'
        : 'Solicitação recusada e decisão registrada no histórico.',
    });
  } catch (error) {
    console.error('Não foi possível atualizar a solicitação de estorno:', error);
    return Response.json({ error: 'Não foi possível atualizar a solicitação agora.' }, { status: 500 });
  }
}
