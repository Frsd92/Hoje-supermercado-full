import { isPixCodeExpired } from './pix-expiration.mjs';

const terminalUnpaidStatuses = new Set(['failed', 'canceled', 'expired']);

export function getPendingPaymentStatus(providerStatus, paymentMethod, expiresAt, now = Date.now()) {
  if (providerStatus === 'pending' && paymentMethod === 'pix' && isPixCodeExpired(expiresAt, now)) {
    return 'expired';
  }
  return providerStatus;
}

export function shouldCancelOrderForPaymentStatus(paymentStatus, orderStatus) {
  return terminalUnpaidStatuses.has(paymentStatus) && orderStatus === 'Recebido';
}
