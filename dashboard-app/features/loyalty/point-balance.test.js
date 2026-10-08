import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateLoyaltyPointBalance,
  getRefundAdjustedAwardPoints,
  planLoyaltyPointRedemption,
} from './point-balance.js';

const now = new Date('2026-10-08T12:00:00.000Z');

function award({ id, points, expiresAt = null, total = 'R$ 100,00', refundedAmount = 'R$ 0,00', consumed = 0 }) {
  return {
    id,
    type: 'MISSION_AWARD',
    points,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    sourceOrder: { total, refundedAmount, status: 'Concluido', paymentStatus: 'paid' },
    awardsAllocations: consumed ? [{ points: consumed }] : [],
  };
}

test('adjusts awarded points proportionally after partial and full refunds', () => {
  assert.equal(getRefundAdjustedAwardPoints(award({
    id: 'partial',
    points: 100,
    refundedAmount: 'R$ 25,00',
  })), 75);
  assert.equal(getRefundAdjustedAwardPoints(award({
    id: 'full',
    points: 100,
    refundedAmount: 'R$ 100,00',
  })), 0);
  assert.equal(getRefundAdjustedAwardPoints({
    ...award({ id: 'canceled', points: 100 }),
    sourceOrder: { total: 'R$ 100,00', refundedAmount: 'R$ 0,00', status: 'Cancelado', paymentStatus: 'manual' },
  }), 0);
});

test('expires unused points but carries refund debt into future earnings', () => {
  const entries = [
    award({ id: 'spent', points: 80, expiresAt: '2026-10-07T00:00:00.000Z', refundedAmount: 'R$ 50,00', consumed: 60 }),
    award({ id: 'future', points: 40, expiresAt: '2026-11-07T00:00:00.000Z' }),
    award({ id: 'expired-unused', points: 30, expiresAt: '2026-10-07T00:00:00.000Z' }),
  ];

  assert.equal(calculateLoyaltyPointBalance(entries, now), 20);
});

test('redemption allocations consume the soonest-expiring points after refund debt', () => {
  const entries = [
    award({ id: 'debt', points: 80, refundedAmount: 'R$ 50,00', consumed: 60 }),
    award({ id: 'soon', points: 30, expiresAt: '2026-10-09T00:00:00.000Z' }),
    award({ id: 'later', points: 50, expiresAt: '2026-11-01T00:00:00.000Z' }),
  ];

  assert.deepEqual(planLoyaltyPointRedemption(entries, 10, now), [
    { awardEntryId: 'soon', points: 10 },
  ]);
  assert.equal(planLoyaltyPointRedemption(entries, 61, now), null);
});

test('requires every redemption debit to have matching point-lot allocations', () => {
  assert.throws(() => calculateLoyaltyPointBalance([{
    id: 'bad',
    type: 'REDEMPTION',
    points: -20,
    spendsAllocations: [{ points: 10 }],
  }], now), /não está totalmente vinculado/);
});
