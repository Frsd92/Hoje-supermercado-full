import { normalizePaymentMethod } from '../../features/payments/card-methods.js';

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'Pix', recommended: true, description: 'QR Code · Pix copia e cola' },
  { value: 'cartao_credito', label: 'Cartão de crédito', description: 'Cartão salvo' },
  { value: 'cartao_debito', label: 'Cartão de débito', description: 'Cartão salvo' },
];

export const DEFAULT_PAYMENT_METHOD = 'pix';
export const PAYMENT_METHOD_UPDATED_EVENT = 'dashboard-payment-method-updated';
export const SAVED_CARD_UPDATED_EVENT = 'dashboard-saved-card-updated';

export function isPaymentMethod(value) {
  return PAYMENT_METHODS.some((method) => method.value === value) || value === 'cartao';
}

export function getPaymentMethodStorageKey(email) {
  return `hoje-dashboard-payment-method-${email || 'guest'}`;
}

export function readPaymentMethod(email) {
  const storedMethod = normalizePaymentMethod(localStorage.getItem(getPaymentMethodStorageKey(email)));
  return PAYMENT_METHODS.some((method) => method.value === storedMethod) ? storedMethod : DEFAULT_PAYMENT_METHOD;
}

export function savePaymentMethod(email, method) {
  const normalizedMethod = normalizePaymentMethod(method);
  if (!PAYMENT_METHODS.some((option) => option.value === normalizedMethod)) {
    throw new Error('Selecione uma forma de pagamento disponível.');
  }

  const accountEmail = email || 'guest';
  localStorage.setItem(getPaymentMethodStorageKey(accountEmail), normalizedMethod);
  window.dispatchEvent(new CustomEvent(PAYMENT_METHOD_UPDATED_EVENT, {
    detail: { email: accountEmail, method: normalizedMethod },
  }));
}
