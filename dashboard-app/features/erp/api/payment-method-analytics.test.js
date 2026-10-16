import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateAnalyticsPayments,
  getAnalyticsPaymentLabel,
  isKnownAnalyticsPaymentMethod,
  normalizeAnalyticsPaymentMethod,
} from './payment-method-analytics.js';

test('normalizes payment types and voucher brands for analytics', () => {
  assert.equal(normalizeAnalyticsPaymentMethod('Cartão de crédito'), 'cartao_credito');
  assert.equal(normalizeAnalyticsPaymentMethod('cartao_debito'), 'cartao_debito');
  assert.equal(normalizeAnalyticsPaymentMethod('VA'), 'vale_alimentacao');
  assert.equal(normalizeAnalyticsPaymentMethod('VR'), 'vale_refeicao');
  assert.equal(normalizeAnalyticsPaymentMethod('Pluxee'), 'pluxee');
  assert.equal(getAnalyticsPaymentLabel('sodexo'), 'Sodexo');
  assert.equal(getAnalyticsPaymentLabel('alelo'), 'Alelo');
  assert.equal(getAnalyticsPaymentLabel('ticket'), 'Ticket');
});

test('aggregates aliases, counts transactions, sums values, and sorts most used first', () => {
  assert.deepEqual(aggregateAnalyticsPayments([
    { method: 'pix', value: 25 },
    { method: 'VA', value: 40 },
    { method: 'vale_alimentacao', value: 15 },
    { method: 'cartao_credito', value: 32 },
    { method: 'VR', value: 10 },
  ]), [
    { method: 'vale_alimentacao', label: 'Vale-alimentação (VA)', orders: 2, value: 55 },
    { method: 'cartao_credito', label: 'Cartão de crédito', orders: 1, value: 32 },
    { method: 'pix', label: 'Pix', orders: 1, value: 25 },
    { method: 'vale_refeicao', label: 'Vale-refeição (VR)', orders: 1, value: 10 },
  ]);
});

test('identifies missing or unsupported payment method values as unreported', () => {
  assert.equal(isKnownAnalyticsPaymentMethod('pix'), true);
  assert.equal(isKnownAnalyticsPaymentMethod(''), false);
  assert.equal(isKnownAnalyticsPaymentMethod('unknown_gateway_code'), false);
  assert.equal(normalizeAnalyticsPaymentMethod('unknown_gateway_code'), 'nao_informado');
});
