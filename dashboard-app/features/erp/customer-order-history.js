import { refundRequestStatusLabels } from '../orders/order-refund-utils.js';

const serviceRequestLabels = {
  cancellation: 'Cancelamento',
  exchange: 'Troca',
};

function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

function eventDateTime(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function getCustomerOrderHistory(orders) {
  return [...orders]
    .sort((first, second) => eventDateTime(second.createdAt) - eventDateTime(first.createdAt))
    .map((order) => {
      const total = Math.max(0, amount(order.total));
      const refundedAmount = Math.max(0, amount(order.refundedAmount));
      const approvedCancellation = order.serviceRequests?.some((request) => (
        request.type === 'cancellation' && request.status === 'approved'
      ));
      const events = [{
        id: `${order.id}-created`,
        type: 'purchase',
        label: 'Pedido realizado',
        createdAt: order.createdAt,
        actor: order.customerName || order.customerEmail || 'Cliente',
        note: '',
      }];

      (order.serviceRequests || []).forEach((request) => {
        const requestLabel = serviceRequestLabels[request.type] || 'Atendimento';
        events.push({
          id: `${request.id}-requested`,
          type: request.type === 'cancellation' ? 'cancellation' : 'service',
          label: `Solicitação de ${requestLabel.toLowerCase()}`,
          createdAt: request.createdAt,
          actor: request.requestedBy,
          note: request.reason,
        });
        if (request.reviewedAt) {
          events.push({
            id: `${request.id}-reviewed`,
            type: request.type === 'cancellation' && request.status === 'approved' ? 'cancellation' : 'service',
            label: request.type === 'cancellation' && request.status === 'approved'
              ? 'Cancelamento aprovado'
              : `${requestLabel} ${request.status === 'approved' ? 'aprovada' : 'analisada'}`,
            createdAt: request.reviewedAt,
            actor: request.reviewedBy,
            note: request.decisionNote || '',
          });
        }
      });

      (order.paymentEvents || []).forEach((event) => {
        events.push({
          id: event.id,
          type: 'payment',
          label: `Atualização de pagamento: ${event.eventType}`,
          createdAt: event.receivedAt,
          actor: 'Pagar.me',
          note: '',
        });
      });

      (order.refundRequests || []).forEach((request) => {
        (request.events || []).forEach((event) => {
          events.push({
            id: event.id,
            type: 'refund',
            label: refundRequestStatusLabels[event.action] || `Atualização do estorno: ${event.action}`,
            createdAt: event.createdAt,
            actor: event.actor,
            note: event.note || '',
            amount: amount(request.amount),
            requestCode: request.code,
          });
        });
      });

      if (order.status === 'Cancelado' && !approvedCancellation) {
        events.push({
          id: `${order.id}-cancelled-status`,
          type: 'cancellation',
          label: 'Pedido com status cancelado',
          createdAt: order.updatedAt,
          actor: order.updatedBy || '',
          note: 'A data exibida é a última atualização do pedido; não há evento de cancelamento registrado para confirmar o momento exato.',
        });
      }

      events.sort((first, second) => eventDateTime(first.createdAt) - eventDateTime(second.createdAt));

      return {
        id: order.id,
        createdAt: order.createdAt,
        status: order.status || 'Recebido',
        paymentStatus: order.paymentStatus || 'manual',
        paymentMethod: order.paymentMethod || 'Não informado',
        updatedAt: order.updatedAt,
        updatedBy: order.updatedBy || '',
        total,
        refundedAmount,
        netAmount: total - refundedAmount,
        items: (order.items || []).map((item) => ({
          id: item.id,
          name: item.name,
          productCode: item.productCode || '',
          quantity: Number(item.quantity) || 0,
          unit: item.unit || 'unidade',
          unitPrice: amount(item.price),
          total: amount(item.price) * (Number(item.quantity) || 0),
        })),
        refunds: (order.refundRequests || []).map((request) => ({
          id: request.id,
          code: request.code,
          amount: amount(request.amount),
          status: request.status,
          statusLabel: refundRequestStatusLabels[request.status] || request.status,
          reason: request.reason,
          requestedBy: request.requestedBy,
          createdAt: request.createdAt,
          reviewedBy: request.reviewedBy || '',
          reviewedAt: request.reviewedAt,
          decisionNote: request.decisionNote || '',
        })),
        events,
        statusDateIsApproximate: order.status === 'Cancelado' && !approvedCancellation,
      };
    });
}
