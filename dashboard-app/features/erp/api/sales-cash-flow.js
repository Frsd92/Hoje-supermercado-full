function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;

  let normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function roundMoney(value) {
  return Number(value.toFixed(2));
}

export function buildSalesCashFlowEntries(sales = []) {
  const entries = [];

  for (const sale of Array.isArray(sales) ? sales : []) {
    const total = parseAmount(sale.total);
    if (total === null || total <= 0) continue;

    const refundedAmount = Math.min(total, Math.max(0, parseAmount(sale.refundedAmount) || 0));
    const paymentStatus = String(sale.paymentStatus || '').toLowerCase();
    const hasConfirmedPayment = ['paid', 'partially_refunded', 'refunded'].includes(paymentStatus)
      || refundedAmount > 0;
    if (!hasConfirmedPayment) continue;

    const orderId = String(sale.id || '');
    const description = sale.customerName ? `Venda · ${sale.customerName}` : `Venda · ${orderId}`;
    entries.push({
      id: `sale-${orderId}`,
      reference: `VEN-${orderId.slice(-8)}`,
      date: sale.createdAt,
      description,
      category: 'Vendas',
      type: 'Entrada',
      status: refundedAmount >= total ? 'Estornado' : refundedAmount > 0 ? 'Estorno parcial' : 'Pago',
      amount: roundMoney(total),
      direction: 'entry',
    });

    let remainingRefund = refundedAmount;
    for (const [index, refund] of (Array.isArray(sale.refunds) ? sale.refunds : []).entries()) {
      const requestedAmount = Math.max(0, parseAmount(refund.amount) || 0);
      const amount = Math.min(remainingRefund, requestedAmount);
      if (amount <= 0) continue;

      entries.push({
        id: `refund-${orderId}-${refund.id || index}`,
        reference: `EST-${String(refund.id || orderId).slice(-8)}`,
        date: refund.date || sale.refundDate || sale.createdAt,
        description: `Estorno · Pedido ${orderId}`,
        category: 'Estornos de vendas',
        type: 'Saída',
        status: 'Estornado',
        amount: roundMoney(amount),
        direction: 'exit',
      });
      remainingRefund = roundMoney(remainingRefund - amount);
    }

    if (remainingRefund > 0) {
      entries.push({
        id: `refund-${orderId}-confirmed`,
        reference: `EST-${orderId.slice(-8)}`,
        date: sale.refundDate || sale.createdAt,
        description: `Estorno confirmado · Pedido ${orderId}`,
        category: 'Estornos de vendas',
        type: 'Saída',
        status: 'Estornado',
        amount: roundMoney(remainingRefund),
        direction: 'exit',
      });
    }
  }

  return entries;
}
