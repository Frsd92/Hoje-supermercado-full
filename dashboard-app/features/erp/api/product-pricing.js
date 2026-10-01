function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

export function calculateSalePrice({ price: rawPrice, promotionalPrice: rawPromotionalPrice, discount: rawDiscount }) {
  const price = parseAmount(rawPrice);
  const promotionalPrice = parseAmount(rawPromotionalPrice);
  const discount = Math.min(100, Math.max(0, Number(String(rawDiscount || '').replace(',', '.')) || 0));

  if (promotionalPrice > 0) return promotionalPrice;
  return Math.round(price * (1 - discount / 100) * 100) / 100;
}
