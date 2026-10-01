export const purchaseOrderStatuses = [
  'Rascunho',
  'Aguardando Confirmação',
  'Confirmado',
  'Em Trânsito',
  'Recebido',
  'Cancelado',
];

const transitions = {
  'Rascunho': ['Aguardando Confirmação', 'Cancelado'],
  'Aguardando Confirmação': ['Confirmado', 'Cancelado'],
  'Confirmado': ['Em Trânsito', 'Cancelado'],
  'Em Trânsito': ['Cancelado'],
  'Recebido': [],
  'Cancelado': [],
};

function supportsDecimalPlaces(value, places) {
  const scaled = value * (10 ** places);
  return Math.abs(scaled - Math.round(scaled)) < 1e-8;
}

export function canTransitionPurchaseOrder(currentStatus, nextStatus) {
  return transitions[currentStatus]?.includes(nextStatus) || false;
}

export function isPurchaseOrderLate(order, now = new Date()) {
  if (!order.expectedDelivery || ['Rascunho', 'Recebido', 'Cancelado'].includes(order.status)) return false;
  const dateKey = (value) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value)).filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => part.value).join('-');
  const expectedDate = typeof order.expectedDelivery === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.expectedDelivery)
    ? order.expectedDelivery
    : dateKey(order.expectedDelivery);
  return expectedDate < dateKey(now);
}

export function validatePurchaseOrder(input) {
  const supplierId = String(input?.supplierId || '').trim();
  if (!supplierId) return { error: 'Selecione um fornecedor ativo.' };
  if (!Array.isArray(input?.items) || !input.items.length) return { error: 'Adicione ao menos um produto ao pedido.' };

  const items = [];
  const productIds = new Set();
  for (const item of input.items) {
    const productId = String(item?.productId || '').trim();
    const quantity = Number(item?.quantity);
    const unitPrice = Number(String(item?.unitPrice ?? '').replace(',', '.'));
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) return { error: 'Informe um produto e uma quantidade maior que zero em cada item.' };
    if (!supportsDecimalPlaces(quantity, 3)) return { error: 'A quantidade aceita no máximo três casas decimais.' };
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: 'Informe um custo unitário válido em cada item.' };
    if (!supportsDecimalPlaces(unitPrice, 2)) return { error: 'O custo unitário aceita no máximo duas casas decimais.' };
    if (productIds.has(productId)) return { error: 'O mesmo produto não pode aparecer mais de uma vez no pedido.' };
    productIds.add(productId);
    items.push({ productId, quantity, unitPrice });
  }

  const expectedDelivery = input.expectedDelivery ? new Date(`${input.expectedDelivery}T12:00:00.000-03:00`) : null;
  if (expectedDelivery && Number.isNaN(expectedDelivery.getTime())) return { error: 'Informe uma data de entrega válida.' };

  return {
    data: {
      supplierId,
      expectedDelivery,
      notes: String(input.notes || '').trim() || null,
      items,
      total: Number(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0).toFixed(2)),
    },
  };
}

function jsonValue(value) {
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, jsonValue(value[key])]));
  }
  return value;
}

export function purchaseOrderSnapshot(order) {
  return JSON.parse(JSON.stringify(jsonValue(order)));
}
