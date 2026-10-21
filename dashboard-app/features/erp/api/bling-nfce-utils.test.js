import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBlingDocumentUrl,
  getBlingNfceStatus,
  getBlingNfceStatusMessage,
  isEligiblePaidOrder,
} from './bling-nfce-utils.js';

test('automatically issues only paid Pagar.me online orders', () => {
  const paidOrder = {
    paymentStatus: 'paid',
    paymentMethod: 'pix',
    pagarmeOrderId: 'or_123',
    status: 'Recebido',
  };

  assert.equal(isEligiblePaidOrder(paidOrder), true);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, paymentStatus: 'pending' }), false);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, paymentMethod: 'dinheiro' }), false);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, pagarmeOrderId: null }), false);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, status: 'Cancelado' }), false);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, paymentMethod: 'cartao_credito' }), true);
  assert.equal(isEligiblePaidOrder({ ...paidOrder, paymentMethod: 'vale_alimentacao' }), true);
});

test('maps NFC-e authorization, rejection and pending states from Bling', () => {
  assert.equal(getBlingNfceStatus({ situacao: 5 }), 'authorized');
  assert.equal(getBlingNfceStatus({ situacao: 6 }), 'authorized');
  assert.equal(getBlingNfceStatus({ situacao: 4 }), 'failed');
  assert.equal(getBlingNfceStatus({ situacao: 9 }), 'failed');
  assert.equal(getBlingNfceStatus({ situacao: 8 }), 'processing');
  assert.equal(getBlingNfceStatusMessage('failed', 9), 'A NFC-e foi denegada pela SEFAZ. Verifique a situação fiscal no Bling.');
});

test('only exposes secure HTTPS Bling document links', () => {
  assert.equal(getBlingDocumentUrl('https://example.com/nfce.pdf'), 'https://example.com/nfce.pdf');
  assert.equal(getBlingDocumentUrl('http://example.com/nfce.pdf'), null);
  assert.equal(getBlingDocumentUrl('javascript:alert(1)'), null);
});
