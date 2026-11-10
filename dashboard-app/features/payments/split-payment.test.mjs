import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSplitPaymentMethod,
  normalizeSplitPaymentLines,
  parsePaymentAmountToCents,
} from './split-payment.mjs';

test('parses Brazilian decimal payment amounts exactly into cents', () => {
  assert.equal(parsePaymentAmountToCents('51,25'), 5125);
  assert.equal(parsePaymentAmountToCents('51.25'), 5125);
  assert.equal(parsePaymentAmountToCents('0,01'), 1);
  assert.equal(parsePaymentAmountToCents('1,001'), null);
  assert.equal(parsePaymentAmountToCents('R$ 51,25'), null);
});

test('requires two distinct supported methods whose cent values match the order total exactly', () => {
  assert.deepEqual(normalizeSplitPaymentLines([
    { method: 'pix', amountCents: 5125 },
    { method: 'cartao_credito', amountCents: 5125, savedCardId: 'card_abc' },
  ], 10250), [
    { method: 'cartao_credito', amountCents: 5125, savedCardId: 'card_abc' },
    { method: 'pix', amountCents: 5125 },
  ]);
  assert.throws(() => normalizeSplitPaymentLines([
    { method: 'pix', amountCents: 5125 },
    { method: 'cartao_credito', amountCents: 5124 },
  ], 10250), /exatamente igual/);
  assert.throws(() => normalizeSplitPaymentLines([
    { method: 'pix', amountCents: 5125 },
    { method: 'cartao_credito', amountCents: 5126 },
  ], 10250), /exatamente igual/);
});

test('rejects duplicate methods, voucher combinations, and invalid amounts', () => {
  assert.equal(isSplitPaymentMethod('vale_refeicao'), false);
  assert.throws(() => normalizeSplitPaymentLines([
    { method: 'pix', amountCents: 5000 },
    { method: 'pix', amountCents: 5000 },
  ], 10000), /diferentes/);
  assert.throws(() => normalizeSplitPaymentLines([
    { method: 'vale_alimentacao', amountCents: 5000 },
    { method: 'pix', amountCents: 5000 },
  ], 10000), /Voucher não pode ser combinado/);
  assert.throws(() => normalizeSplitPaymentLines([
    { method: 'pix', amountCents: 0 },
    { method: 'cartao_debito', amountCents: 10000 },
  ], 10000), /maior que zero/);
});
