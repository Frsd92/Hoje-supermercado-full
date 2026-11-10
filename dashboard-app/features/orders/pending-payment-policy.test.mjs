import assert from 'node:assert/strict';
import test from 'node:test';
import { getPendingPaymentStatus, shouldCancelOrderForPaymentStatus } from './pending-payment-policy.mjs';

const expiresAt = '2026-11-10T00:00:00Z';

test('expires a pending Pix at the exact expiration time, not before it', () => {
  assert.equal(getPendingPaymentStatus('pending', 'pix', expiresAt, Date.parse('2026-11-09T23:59:59Z')), 'pending');
  assert.equal(getPendingPaymentStatus('pending', 'pix', expiresAt, Date.parse('2026-11-10T00:00:00Z')), 'expired');
});

test('does not expire a payment confirmed by the provider even if the Pix deadline passed', () => {
  assert.equal(getPendingPaymentStatus('paid', 'pix', expiresAt, Date.parse('2026-11-10T00:01:00Z')), 'paid');
});

test('cancels only unpaid orders still waiting for acceptance', () => {
  assert.equal(shouldCancelOrderForPaymentStatus('expired', 'Recebido'), true);
  assert.equal(shouldCancelOrderForPaymentStatus('failed', 'Recebido'), true);
  assert.equal(shouldCancelOrderForPaymentStatus('paid', 'Recebido'), false);
  assert.equal(shouldCancelOrderForPaymentStatus('expired', 'Separacao'), false);
});
