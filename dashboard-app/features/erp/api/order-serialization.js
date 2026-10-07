function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `R$ ${amount.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
}

function displayDate(value) {
  return value instanceof Date ? value.toLocaleString('pt-BR') : value;
}

function dateToIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function serializeRefundRequest(refundRequest) {
  const { amount, events = [], ...fields } = refundRequest;
  const serializedAmount = typeof amount?.toNumber === 'function' ? amount.toNumber() : Number(amount);
  if (!Number.isFinite(serializedAmount)) throw new Error('Invalid amount in persisted refund request.');
  return {
    ...fields,
    amount: serializedAmount,
    createdAt: displayDate(refundRequest.createdAt),
    createdAtIso: dateToIso(refundRequest.createdAt),
    reviewedAt: displayDate(refundRequest.reviewedAt),
    reviewedAtIso: dateToIso(refundRequest.reviewedAt),
    events: events.map((event) => ({
      ...event,
      createdAt: displayDate(event.createdAt),
      createdAtIso: dateToIso(event.createdAt),
    })),
  };
}

export function serializeServiceRequest(serviceRequest) {
  return {
    ...serviceRequest,
    createdAt: displayDate(serviceRequest.createdAt),
    createdAtIso: dateToIso(serviceRequest.createdAt),
    reviewedAt: displayDate(serviceRequest.reviewedAt),
    reviewedAtIso: dateToIso(serviceRequest.reviewedAt),
  };
}

export function serializeOrder(order) {
  const { items = [], refundRequests = [], serviceRequests = [], ...orderFields } = order;

  return {
    ...orderFields,
    createdAt: displayDate(order.createdAt),
    createdAtIso: dateToIso(order.createdAt),
    updatedAt: displayDate(order.updatedAt),
    total: typeof order.total === 'string' ? order.total : formatAmount(order.total),
    items: items.map((item) => {
      const publicItem = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'unitCost' && key !== 'promotionDiscount'));
      const unit = item.unit === 'kg' ? 'kg' : 'unidade';
      return {
        ...publicItem,
        quantity: Number(item.quantity),
        unit,
        saleUnit: unit === 'kg' ? 'Quilograma' : 'Unidade',
        promotionDiscount: Number(item.promotionDiscount) || 0,
      };
    }),
    refundRequests: refundRequests.map(serializeRefundRequest),
    serviceRequests: serviceRequests.map(serializeServiceRequest),
  };
}

export function serializeOrders(orders) {
  return orders.map(serializeOrder);
}
