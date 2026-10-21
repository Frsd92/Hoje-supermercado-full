import { isCardPaymentMethod } from '../../payments/card-methods.js';

export function isEligiblePaidOrder(order) {
  return order.paymentStatus === 'paid'
    && (order.paymentMethod === 'pix' || isCardPaymentMethod(order.paymentMethod))
    && Boolean(order.pagarmeOrderId)
    && order.status !== 'Cancelado';
}

export function getBlingNfceStatus(note) {
  const situation = Number(note?.situacao);
  if (situation === 5 || situation === 6) return 'authorized';
  if (situation === 4 || situation === 9 || situation === 2 || situation === 11) return 'failed';
  return 'processing';
}

export function getBlingNfceStatusMessage(status, situation) {
  if (status === 'authorized') return null;
  if (status === 'failed') {
    return situation === 2
      ? 'A NFC-e está cancelada no Bling.'
      : situation === 9
        ? 'A NFC-e foi denegada pela SEFAZ. Verifique a situação fiscal no Bling.'
        : situation === 11
          ? 'A NFC-e está bloqueada no Bling. Verifique a configuração fiscal.'
          : 'A NFC-e foi rejeitada. Revise os dados fiscais no Bling antes de tentar novamente.';
  }
  return 'O Bling ainda está processando a autorização da NFC-e.';
}

export function getBlingDocumentUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
