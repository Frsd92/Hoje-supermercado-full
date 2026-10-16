export const CARD_PAYMENT_METHODS = ['cartao_credito', 'cartao_debito'];
export const VOUCHER_PAYMENT_METHODS = ['vale_alimentacao', 'vale_refeicao'];
export const SAVED_CARD_TYPES = ['credit', 'debit', 'food_voucher', 'meal_voucher'];
export const MAX_SAVED_CARDS = 10;

const savedCardTypeLabels = {
  credit: 'Hoje Supermercado - Crédito',
  debit: 'Hoje Supermercado - Débito',
  food_voucher: 'Hoje Supermercado - Vale-alimentação',
  meal_voucher: 'Hoje Supermercado - Vale-refeição',
};

const paymentMethodCardTypes = {
  cartao_credito: 'credit',
  cartao_debito: 'debit',
  vale_alimentacao: 'food_voucher',
  vale_refeicao: 'meal_voucher',
};

export function isVoucherPaymentMethod(value) {
  return VOUCHER_PAYMENT_METHODS.includes(value);
}

export function isCardPaymentMethod(value) {
  return value === 'cartao'
    || CARD_PAYMENT_METHODS.includes(value)
    || isVoucherPaymentMethod(value);
}

export function normalizePaymentMethod(value) {
  return value === 'cartao' ? 'cartao_credito' : value;
}

export function getExpectedCardType(paymentMethod) {
  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  return paymentMethodCardTypes[normalizedMethod] || null;
}

export function isCardTypeCompatible(cardType, paymentMethod) {
  const expectedType = getExpectedCardType(paymentMethod);
  return expectedType !== null && cardType === expectedType;
}

export function isKnownCardType(cardType) {
  return SAVED_CARD_TYPES.includes(cardType);
}

export function getSavedCardTypeLabel(cardType) {
  return savedCardTypeLabels[cardType] || null;
}

export function getSavedCardType(card) {
  const label = String(card?.label || '').trim().toLowerCase();
  const labeledType = SAVED_CARD_TYPES.find(
    (cardType) => label === getSavedCardTypeLabel(cardType).toLowerCase(),
  );
  if (labeledType) return labeledType;

  const providerType = String(card?.type || '').trim().toLowerCase();
  return isKnownCardType(providerType) ? providerType : null;
}
