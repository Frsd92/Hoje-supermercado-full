import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPendingPaymentStatus,
  shouldCancelOrderForPaymentStatus,
  shouldReconcilePendingPayment,
} from './pending-payment-policy.mjs';

const expiresAt = '2026-11-10T00:00:00Z';

test('expires a pending Pix at the exact expiration time, not before it', () => {
  assert.equal(getPendingPaymentStatus('pending', 'pix', expiresAt, Date.parse('2026-11-09T23:59:59Z')), 'pending');
  assert.equal(getPendingPaymentStatus('pending', 'pix', expiresAt, Date.parse('2026-11-10T00:00:00Z')), 'expired');
});

test('does not expire a payment confirmed by the provider even if the Pix deadline passed', () => {
  assert.equal(getPendingPaymentStatus('paid', 'pix', expiresAt, Date.parse('2026-11-10T00:01:00Z')), 'paid');
});

test('uses provider status for card and voucher payments without inferring an expiration', () => {
  for (const paymentMethod of ['cartao_credito', 'cartao_debito', 'vale_alimentacao', 'vale_refeicao']) {
    assert.equal(getPendingPaymentStatus('pending', paymentMethod, expiresAt, Date.parse('2026-11-11T00:00:00Z')), 'pending');
    assert.equal(getPendingPaymentStatus('failed', paymentMethod, expiresAt, Date.parse('2026-11-11T00:00:00Z')), 'failed');
    assert.equal(getPendingPaymentStatus('canceled', paymentMethod, expiresAt, Date.parse('2026-11-11T00:00:00Z')), 'canceled');
  }
});

test('reconciles card and voucher payments while waiting, but checks Pix only after code expiry', () => {
  const beforePixExpiry = Date.parse('2026-11-09T23:59:59Z');
  const afterPixExpiry = Date.parse('2026-11-10T00:00:00Z');
  assert.equal(shouldReconcilePendingPayment({ paymentMethod: 'pix', paymentDetails: { pixExpiresAt: expiresAt } }, beforePixExpiry), false);
  assert.equal(shouldReconcilePendingPayment({ paymentMethod: 'pix', paymentDetails: { pixExpiresAt: expiresAt } }, afterPixExpiry), true);

  for (const paymentMethod of ['cartao', 'cartao_credito', 'cartao_debito', 'vale_alimentacao', 'vale_refeicao']) {
    assert.equal(shouldReconcilePendingPayment({ paymentMethod }, beforePixExpiry), true);
  }
});

test('cancels only unpaid orders still waiting for acceptance', () => {
  assert.equal(shouldCancelOrderForPaymentStatus('expired', 'Recebido'), true);
  assert.equal(shouldCancelOrderForPaymentStatus('failed', 'Recebido'), true);
  assert.equal(shouldCancelOrderForPaymentStatus('paid', 'Recebido'), false);
  assert.equal(shouldCancelOrderForPaymentStatus('expired', 'Separacao'), false);
});

test('expires combined payments when the embedded Pix code has expired', () => {
  assert.equal(getPendingPaymentStatus('pending', 'combinado', '2025-01-01T00:00:00Z', Date.parse('2025-01-01T01:00:00Z')), 'expired');
  assert.equal(getPendingPaymentStatus('pending', 'combinado', '2025-01-01T02:00:00Z', Date.parse('2025-01-01T01:00:00Z')), 'pending');
});
