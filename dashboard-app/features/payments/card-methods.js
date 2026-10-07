export const CARD_PAYMENT_METHODS = ['cartao_credito', 'cartao_debito'];
export const MAX_SAVED_CARDS = 10;

export function isCardPaymentMethod(value) {
  return value === 'cartao' || CARD_PAYMENT_METHODS.includes(value);
}

export function normalizePaymentMethod(value) {
  return value === 'cartao' ? 'cartao_credito' : value;
}
