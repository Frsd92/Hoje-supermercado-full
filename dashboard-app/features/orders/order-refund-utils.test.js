import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRemainingRefundCents,
  refundRequestStatus,
  validateRefundAmount,
} from './order-refund-utils.js';

test('reserves requested and approved amounts but not rejected requests', () => {
  const remaining = getRemainingRefundCents('R$ 100,00', [
    { status: refundRequestStatus.requested, amount: '25.50' },
    { status: refundRequestStatus.approvedWaitingGateway, amount: 10 },
    { status: refundRequestStatus.rejected, amount: 40 },
  ]);

  assert.equal(remaining, 6450);
});

test('allows a partial request within the remaining order total', () => {
  const result = validateRefundAmount({
    amount: 'R$ 64,50',
    orderTotal: 'R$ 100,00',
    refundRequests: [{ status: refundRequestStatus.requested, amount: 35.5 }],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.amountCents, 6450);
  assert.equal(result.remainingCents, 6450);
});

test('rejects zero, malformed and over-limit amounts', () => {
  const input = { orderTotal: 'R$ 20,00', refundRequests: [] };

  assert.ok(validateRefundAmount({ ...input, amount: '1e6' }).error);
  assert.ok(validateRefundAmount({ ...input, amount: '1,234' }).error);
  assert.ok(validateRefundAmount({ ...input, amount: 0 }).error);
  assert.ok(validateRefundAmount({ ...input, amount: '20,01' }).error);
});

test('converts persisted decimal objects without losing cents', () => {
  const result = validateRefundAmount({
    amount: 5,
    orderTotal: 'R$ 20,00',
    refundRequests: [{ status: refundRequestStatus.completed, amount: { toNumber: () => 7.25 } }],
  });

  assert.equal(result.amountCents, 500);
  assert.equal(result.remainingCents, 1275);
});
