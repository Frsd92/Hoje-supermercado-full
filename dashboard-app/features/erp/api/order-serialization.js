function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? `R$ ${amount.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
}

function displayDate(value) {
  return value instanceof Date ? value.toLocaleString('pt-BR') : value;
}

export function serializeOrder(order) {
  const { items = [], ...orderFields } = order;

  return {
    ...orderFields,
    createdAt: displayDate(order.createdAt),
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
      };
    }),
  };
}

export function serializeOrders(orders) {
  return orders.map(serializeOrder);
}
