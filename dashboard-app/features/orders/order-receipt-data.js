function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

export function parseReceiptAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  const normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  const amount = Number(decimalValue);
  return Number.isFinite(amount) ? amount : 0;
}

export function calculateOrderTotals(items, couponDiscountPercent = 0) {
  const lines = (Array.isArray(items) ? items : []).map((item) => {
    const quantityValue = Number(item?.quantity);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const unitPrice = parseReceiptAmount(item?.price);
    return {
      name: String(item?.name || 'Item do pedido'),
      quantity,
      unit: item?.unit === 'kg' || item?.saleUnit === 'Quilograma' ? 'kg' : 'unidade',
      unitPrice: roundMoney(unitPrice),
      lineTotal: roundMoney(unitPrice * quantity),
    };
  });
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const rawDiscountPercent = Number(couponDiscountPercent);
  const discountPercent = Number.isFinite(rawDiscountPercent)
    ? Math.min(90, Math.max(0, rawDiscountPercent))
    : 0;
  const couponDiscountAmount = roundMoney(subtotal * discountPercent / 100);

  return {
    lines,
    subtotal,
    couponDiscountAmount,
    total: roundMoney(subtotal - couponDiscountAmount),
  };
}

export function buildOrderReceiptData(order = {}) {
  const items = Array.isArray(order.items) ? order.items : [];
  const calculated = calculateOrderTotals(items);
  const savedSubtotal = parseReceiptAmount(order.subtotal);
  const subtotal = savedSubtotal > 0 || items.length === 0
    ? roundMoney(savedSubtotal)
    : calculated.subtotal;
  const hasSavedTotal = order.total !== null
    && order.total !== undefined
    && String(order.total).trim() !== '';
  const savedTotal = hasSavedTotal ? roundMoney(parseReceiptAmount(order.total)) : null;
  const couponCode = String(order.couponCode || '').trim().toUpperCase();
  const savedDiscount = parseReceiptAmount(order.couponDiscountAmount);
  const rawDiscountPercent = Number(order.couponDiscountPercent);
  const hasCoupon = Boolean(couponCode) || (Number.isFinite(rawDiscountPercent) && rawDiscountPercent > 0);
  const couponDiscountAmount = savedDiscount > 0
    ? roundMoney(savedDiscount)
    : hasCoupon && savedTotal !== null
      ? roundMoney(Math.max(0, subtotal - savedTotal))
      : 0;
  const total = savedTotal === null
    ? roundMoney(Math.max(0, subtotal - couponDiscountAmount))
    : savedTotal;

  return {
    orderId: String(order.id || ''),
    createdAt: order.createdAtIso || order.createdAt || null,
    status: String(order.status || 'Não informado'),
    paymentMethod: String(order.paymentMethod || ''),
    includeCpfOnReceipt: order.includeCpfOnReceipt === true,
    couponCode,
    couponDiscountPercent: Number.isFinite(rawDiscountPercent) ? rawDiscountPercent : 0,
    items: calculated.lines,
    itemSubtotal: calculated.subtotal,
    subtotal,
    subtotalAdjustment: roundMoney(subtotal - calculated.subtotal),
    couponDiscountAmount,
    total,
    totalAdjustment: roundMoney(total - (subtotal - couponDiscountAmount)),
  };
}
