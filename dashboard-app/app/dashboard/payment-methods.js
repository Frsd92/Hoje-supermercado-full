export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix · Pagar.me', description: 'Pagamento online com QR Code e confirmação automática.' },
  { value: 'cartao', label: 'Cartão · Pagar.me', description: 'Cartão tokenizado no navegador e confirmação automática.' },
  { value: 'dinheiro', label: 'Dinheiro', description: 'Pagamento combinado com a loja, sem processamento pela Pagar.me.' },
];

export const DEFAULT_PAYMENT_METHOD = null;
export const PAYMENT_METHOD_UPDATED_EVENT = 'dashboard-payment-method-updated';

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
