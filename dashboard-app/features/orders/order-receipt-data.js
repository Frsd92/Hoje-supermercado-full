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

export function calculateOrderTotals(items, couponOptions = 0) {
  const lines = (Array.isArray(items) ? items : []).map((item) => {
    const quantityValue = Number(item?.quantity);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : 1;
    const unitPrice = parseReceiptAmount(item?.price);
    return {
      name: String(item?.name || 'Item do pedido'),
      quantity,
      unit: item?.unit === 'kg' || item?.saleUnit === 'Quilograma' ? 'kg' : 'unidade',
      productCode: String(item?.productCode || '').trim(),
      promotionType: String(item?.promotionType || ''),
      unitPrice: roundMoney(unitPrice),
      lineTotal: roundMoney(unitPrice * quantity),
      promotionDiscount: Math.max(0, roundMoney(parseReceiptAmount(item?.promotionDiscount))),
    };
  });
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const options = typeof couponOptions === 'number'
    ? { discountPercent: couponOptions }
    : couponOptions || {};
  const rawDiscountPercent = Number(options.discountPercent);
  const discountPercent = Number.isFinite(rawDiscountPercent)
    ? Math.min(90, Math.max(0, rawDiscountPercent))
    : 0;
  const couponDiscountAmount = roundMoney(subtotal * discountPercent / 100);
  const deliveryFee = roundMoney(Math.max(0, parseReceiptAmount(options.deliveryFee)));
  const serviceFee = roundMoney(Math.max(0, parseReceiptAmount(options.serviceFee)));
  const chargedDeliveryFee = options.benefitType === 'FREE_DELIVERY' ? 0 : deliveryFee;
  const chargedServiceFee = options.benefitType === 'FREE_SERVICE_FEE' ? 0 : serviceFee;
  const couponFeeSavings = roundMoney(
    (options.benefitType === 'FREE_DELIVERY' ? deliveryFee : 0)
    + (options.benefitType === 'FREE_SERVICE_FEE' ? serviceFee : 0),
  );

  return {
    lines,
    subtotal,
    couponDiscountAmount,
    couponBenefitType: options.benefitType || (discountPercent ? 'PERCENTAGE' : null),
    couponFeeSavings,
    deliveryFee: chargedDeliveryFee,
    serviceFee: chargedServiceFee,
    total: roundMoney(subtotal - couponDiscountAmount + chargedDeliveryFee + chargedServiceFee),
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
  const promotionDiscountAmount = roundMoney(calculated.lines.reduce((sum, line) => sum + line.promotionDiscount, 0));
  const savedDiscount = parseReceiptAmount(order.couponDiscountAmount);
  const rawDiscountPercent = Number(order.couponDiscountPercent);
  const hasCoupon = Boolean(couponCode) || (Number.isFinite(rawDiscountPercent) && rawDiscountPercent > 0);
  const invoiceCpf = order.includeCpfOnReceipt === true ? String(order.invoiceCpf || '').replace(/\D/g, '') : '';
  const couponDiscountAmount = savedDiscount > 0
    ? roundMoney(savedDiscount)
    : hasCoupon && savedTotal !== null
      ? roundMoney(Math.max(0, subtotal - savedTotal))
      : 0;
  const deliveryFee = roundMoney(Math.max(0, parseReceiptAmount(order.deliveryFee)));
  const serviceFee = roundMoney(Math.max(0, parseReceiptAmount(order.serviceFee)));
  const couponFeeSavings = roundMoney(Math.max(0, parseReceiptAmount(order.couponFeeSavings)));
  const total = savedTotal === null
    ? roundMoney(Math.max(0, subtotal - couponDiscountAmount + deliveryFee + serviceFee))
    : savedTotal;

  return {
    orderId: String(order.id || ''),
    createdAt: order.createdAtIso || order.createdAt || null,
    status: String(order.status || 'Não informado'),
    paymentMethod: String(order.paymentMethod || ''),
    includeCpfOnReceipt: order.includeCpfOnReceipt === true,
    invoiceCpf: invoiceCpf.length === 11 ? invoiceCpf : '',
    couponCode,
    couponDiscountPercent: Number.isFinite(rawDiscountPercent) ? rawDiscountPercent : 0,
    couponBenefitType: String(order.couponBenefitType || ''),
    couponFeeSavings,
    items: calculated.lines,
    itemLineCount: calculated.lines.length,
    totalUnitQuantity: roundMoney(calculated.lines
      .filter((item) => item.unit === 'unidade')
      .reduce((sum, item) => sum + item.quantity, 0)),
    totalWeightQuantity: roundMoney(calculated.lines
      .filter((item) => item.unit === 'kg')
      .reduce((sum, item) => sum + item.quantity, 0)),
    promotionDiscountAmount,
    itemSubtotal: calculated.subtotal,
    subtotal,
    subtotalAdjustment: roundMoney(subtotal - calculated.subtotal),
    couponDiscountAmount,
    deliveryFee,
    serviceFee,
    total,
    totalAdjustment: roundMoney(total - (subtotal - couponDiscountAmount)),
  };
}
