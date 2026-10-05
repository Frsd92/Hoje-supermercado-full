import { parseReceiptAmount } from './order-receipt-data.js';

export const refundRequestStatus = Object.freeze({
  requested: 'requested',
  approvedWaitingGateway: 'approved_waiting_gateway',
  gatewayProcessing: 'gateway_processing',
  gatewayFailed: 'gateway_failed',
  rejected: 'rejected',
  completed: 'completed',
});

export const reservedRefundStatuses = Object.freeze([
  refundRequestStatus.requested,
  refundRequestStatus.approvedWaitingGateway,
  refundRequestStatus.gatewayProcessing,
  refundRequestStatus.gatewayFailed,
  refundRequestStatus.completed,
]);

export const refundRequestStatusLabels = Object.freeze({
  [refundRequestStatus.requested]: 'Aguardando análise',
  [refundRequestStatus.approvedWaitingGateway]: 'Aprovado · estorno manual pendente',
  [refundRequestStatus.gatewayProcessing]: 'Estorno enviado · aguardando confirmação',
  [refundRequestStatus.gatewayFailed]: 'Falha no estorno · requer nova tentativa',
  [refundRequestStatus.rejected]: 'Recusado',
  [refundRequestStatus.completed]: 'Estorno confirmado pela gateway',
});

export function amountToCents(value) {
  if (value && typeof value === 'object' && typeof value.toNumber === 'function') {
    return amountToCents(value.toNumber());
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return 0;
    const cents = value * 100;
    const roundedCents = Math.round(cents);
    return Number.isSafeInteger(roundedCents) && Math.abs(cents - roundedCents) < 0.000001 ? roundedCents : 0;
  }
  if (typeof value !== 'string') return 0;

  const normalized = value.trim().replace(/^R\$\s*/i, '');
  const brazilianAmount = /^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/;
  const decimalAmount = /^\d+(?:\.\d{1,2})?$/;
  if (!brazilianAmount.test(normalized) && !decimalAmount.test(normalized)) return 0;

  const amount = parseReceiptAmount(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  const cents = amount * 100;
  const roundedCents = Math.round(cents);
  return Number.isSafeInteger(roundedCents) && Math.abs(cents - roundedCents) < 0.000001 ? roundedCents : 0;
}

export function getReservedRefundCents(refundRequests = []) {
  return refundRequests.reduce((total, request) => (
    reservedRefundStatuses.includes(request?.status)
      ? total + amountToCents(request.amount)
      : total
  ), 0);
}

export function getRemainingRefundCents(orderTotal, refundRequests = [], refundedAmount = 0) {
  const reservedCents = getReservedRefundCents(refundRequests);
  const confirmedRefundedCents = amountToCents(refundedAmount);
  return Math.max(0, amountToCents(orderTotal) - Math.max(reservedCents, confirmedRefundedCents));
}

export function validateRefundAmount({ amount, orderTotal, refundRequests = [], refundedAmount = 0 }) {
  const amountCents = amountToCents(amount);
  const remainingCents = getRemainingRefundCents(orderTotal, refundRequests, refundedAmount);

  if (amountCents <= 0) return { error: 'Informe um valor de estorno maior que zero.', amountCents, remainingCents };
  if (amountCents > remainingCents) {
    return { error: 'O valor solicitado excede o saldo ainda disponível para solicitação neste pedido.', amountCents, remainingCents };
  }
  return { amountCents, remainingCents };
}
