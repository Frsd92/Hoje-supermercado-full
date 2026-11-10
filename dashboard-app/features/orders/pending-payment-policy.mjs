import { isPixCodeExpired } from './pix-expiration.mjs';

const terminalUnpaidStatuses = new Set(['failed', 'canceled', 'expired']);

export function getPendingPaymentStatus(providerStatus, paymentMethod, expiresAt, now = Date.now()) {
  if (providerStatus === 'pending'
    && (paymentMethod === 'pix' || paymentMethod === 'combinado')
    && isPixCodeExpired(expiresAt, now)) {
    return 'expired';
  }
  return providerStatus;
}

export function shouldReconcilePendingPayment(order, now = Date.now()) {
  return order?.paymentMethod !== 'pix' || isPixCodeExpired(order.paymentDetails?.pixExpiresAt, now);
}

export function shouldCancelOrderForPaymentStatus(paymentStatus, orderStatus) {
  return terminalUnpaidStatuses.has(paymentStatus) && orderStatus === 'Recebido';
}
