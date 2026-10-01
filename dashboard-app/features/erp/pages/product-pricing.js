import { calculateSalePrice } from '../api/product-pricing.js';

export const parseBRL = (value) => {
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
};
export const parsePercent = (value) => Number(String(value || '').replace(',', '.')) || 0;
export const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
export const formatBRL = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function calculateProductPricing({ cost: rawCost, price: rawPrice, promotionalPrice: rawPromotionalPrice, discount: rawDiscount }) {
  const cost = parseBRL(rawCost);
  const price = parseBRL(rawPrice);
  const promotionalPrice = parseBRL(rawPromotionalPrice);
  const discount = Math.min(100, Math.max(0, parsePercent(rawDiscount)));
  const effectivePrice = calculateSalePrice({ price, promotionalPrice, discount });
  const profitValue = roundMoney(effectivePrice - cost);

  return {
    effectivePrice,
    profitValue,
    profitMarginPercent: effectivePrice > 0 ? Number(((profitValue / effectivePrice) * 100).toFixed(2)) : 0,
    markupPercent: cost > 0 ? Number((((price - cost) / cost) * 100).toFixed(2)) : 0,
  };
}

export function priceFromMarkup(cost, markupPercent) {
  return roundMoney(parseBRL(cost) * (1 + parsePercent(markupPercent) / 100));
}
