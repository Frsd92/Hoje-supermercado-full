export const CARD_PAYMENT_METHODS = ['cartao_credito', 'cartao_debito'];
export const SAVED_CARD_TYPES = ['credit', 'debit'];
export const MAX_SAVED_CARDS = 10;

export function isCardPaymentMethod(value) {
  return value === 'cartao' || CARD_PAYMENT_METHODS.includes(value);
}

export function normalizePaymentMethod(value) {
  return value === 'cartao' ? 'cartao_credito' : value;
}

export function getExpectedCardType(paymentMethod) {
  const normalizedMethod = normalizePaymentMethod(paymentMethod);
  if (normalizedMethod === 'cartao_credito') return 'credit';
  if (normalizedMethod === 'cartao_debito') return 'debit';
  return null;
}

export function isCardTypeCompatible(cardType, paymentMethod) {
  const expectedType = getExpectedCardType(paymentMethod);
  return expectedType !== null && cardType === expectedType;
}

export function isKnownCardType(cardType) {
  return SAVED_CARD_TYPES.includes(cardType);
}

export function getSavedCardTypeLabel(cardType) {
  if (!isKnownCardType(cardType)) return null;
  return `Hoje Supermercado - ${cardType === 'debit' ? 'Débito' : 'Crédito'}`;
}

export function getSavedCardType(card) {
  const label = String(card?.label || '').trim().toLowerCase();
  const savedDebitLabel = getSavedCardTypeLabel('debit').toLowerCase();
  const savedCreditLabel = getSavedCardTypeLabel('credit').toLowerCase();
  if (label === savedDebitLabel) return 'debit';
  if (label === savedCreditLabel) return 'credit';

  const providerType = String(card?.type || '').trim().toLowerCase();
  return isKnownCardType(providerType) ? providerType : null;
}
