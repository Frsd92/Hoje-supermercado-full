export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix · Pagar.me', description: 'Pagamento online com QR Code e confirmação automática.' },
  { value: 'cartao', label: 'Cartão · Pagar.me', description: 'Use o cartão salvo em Formas de pagamento no Dashboard.' },
];

export const DEFAULT_PAYMENT_METHOD = null;
export const PAYMENT_METHOD_UPDATED_EVENT = 'dashboard-payment-method-updated';
export const SAVED_CARD_UPDATED_EVENT = 'dashboard-saved-card-updated';

export function isPaymentMethod(value) {
  return PAYMENT_METHODS.some((method) => method.value === value);
}

export function getPaymentMethodStorageKey(email) {
  return `hoje-dashboard-payment-method-${email || 'guest'}`;
}

export function readPaymentMethod(email) {
  const storedMethod = localStorage.getItem(getPaymentMethodStorageKey(email));
  return isPaymentMethod(storedMethod) ? storedMethod : null;
}

export function savePaymentMethod(email, method) {
  if (!isPaymentMethod(method)) throw new Error('Selecione uma forma de pagamento disponível.');

  const accountEmail = email || 'guest';
  localStorage.setItem(getPaymentMethodStorageKey(accountEmail), method);
  window.dispatchEvent(new CustomEvent(PAYMENT_METHOD_UPDATED_EVENT, {
    detail: { email: accountEmail, method },
  }));
}
