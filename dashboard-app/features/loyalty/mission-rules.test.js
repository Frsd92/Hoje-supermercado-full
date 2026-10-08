import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateLoyaltyMissionPoints,
  getLoyaltyMissionCycle,
  getLoyaltyOrderContribution,
  getLoyaltyPointExpiryAt,
  getWeeklyLoyaltyCycle,
  isLoyaltyMissionComplete,
} from './mission-rules.js';

test('weekly mission cycles start Monday at midnight in Sao Paulo', () => {
  const sunday = getWeeklyLoyaltyCycle(new Date('2026-10-11T14:00:00.000Z'));
  const monday = getWeeklyLoyaltyCycle(new Date('2026-10-12T03:00:00.000Z'));

  assert.equal(sunday.cycleStartAt.toISOString(), '2026-10-05T03:00:00.000Z');
  assert.equal(sunday.cycleEndAt.toISOString(), '2026-10-12T03:00:00.000Z');
  assert.equal(monday.cycleStartAt.toISOString(), '2026-10-12T03:00:00.000Z');
});

test('mission cycle respects its start and end boundaries', () => {
  const mission = {
    startsAt: new Date('2026-10-07T12:00:00.000Z'),
    endsAt: new Date('2026-10-10T12:00:00.000Z'),
    recurrence: 'weekly',
  };

  assert.equal(getLoyaltyMissionCycle(mission, new Date('2026-10-07T11:59:59.000Z')), null);
  const cycle = getLoyaltyMissionCycle(mission, new Date('2026-10-08T12:00:00.000Z'));
  assert.equal(cycle.cycleStartAt.toISOString(), '2026-10-05T03:00:00.000Z');
  assert.equal(cycle.cycleEndAt.toISOString(), '2026-10-10T12:00:00.000Z');
  assert.equal(getLoyaltyMissionCycle(mission, mission.endsAt), null);
});

test('counts only completed, paid or manual orders and protects the first-purchase mission', () => {
  const order = { status: 'Concluido', paymentStatus: 'paid', total: 'R$ 120,00', refundedAmount: '20.00' };

  assert.deepEqual(getLoyaltyOrderContribution(order, { ruleType: 'FIRST_PURCHASE' }, 0), {
    contributionAmount: 100,
    contributionCount: 1,
  });
  assert.equal(getLoyaltyOrderContribution(order, { ruleType: 'FIRST_PURCHASE' }, 1), null);
  assert.equal(getLoyaltyOrderContribution({ ...order, status: 'Em transito' }, { ruleType: 'MINIMUM_SPEND' }), null);
  assert.equal(getLoyaltyOrderContribution({ ...order, paymentStatus: 'pending' }, { ruleType: 'MINIMUM_SPEND' }), null);
  assert.equal(getLoyaltyOrderContribution({ ...order, paymentStatus: 'refunded' }, { ruleType: 'MINIMUM_SPEND' }), null);
  assert.equal(getLoyaltyOrderContribution({ ...order, refundedAmount: '120.00' }, { ruleType: 'MINIMUM_SPEND' }), null);
});

test('counts category spend after order discount and partial refunds', () => {
  const contribution = getLoyaltyOrderContribution({
    status: 'Concluido',
    paymentStatus: 'paid',
    total: 'R$ 90,00',
    subtotal: 'R$ 100,00',
    refundedAmount: 'R$ 10,00',
    items: [
      { price: 'R$ 50,00', quantity: 1, product: { categories: ['Hortifruti'] } },
      { price: 'R$ 50,00', quantity: 1, product: { categories: ['Mercearia'] } },
    ],
  }, { ruleType: 'CATEGORY_SPEND', category: 'hortifruti' });

  assert.deepEqual(contribution, { contributionAmount: 40, contributionCount: 1 });
});

test('completes frequency and spend missions against the appropriate progress field', () => {
  assert.equal(isLoyaltyMissionComplete({ ruleType: 'PURCHASE_FREQUENCY', targetCount: 3 }, { progressCount: 3 }), true);
  assert.equal(isLoyaltyMissionComplete({ ruleType: 'MINIMUM_SPEND', targetAmount: '100.00' }, { progressAmount: '99.99' }), false);
  assert.equal(isLoyaltyMissionComplete({ ruleType: 'CATEGORY_SPEND', targetAmount: '100.00' }, { progressAmount: '100.00' }), true);
});

test('distributes the exact reward point total deterministically', () => {
  const allocation = allocateLoyaltyMissionPoints(10, [
    { orderId: 'PED-B', contributionAmount: 50, contributionCount: 1 },
    { orderId: 'PED-A', contributionAmount: 50, contributionCount: 1 },
    { orderId: 'PED-C', contributionAmount: 100, contributionCount: 1 },
  ], 'MINIMUM_SPEND');

  assert.equal(allocation.reduce((sum, item) => sum + item.points, 0), 10);
  assert.deepEqual(allocation, [
    { orderId: 'PED-B', points: 2 },
    { orderId: 'PED-A', points: 3 },
    { orderId: 'PED-C', points: 5 },
  ]);
});

test('computes each mission expiry from its configured rule', () => {
  const awardedAt = new Date('2026-10-08T12:00:00.000Z');
  const cycleEndAt = new Date('2026-10-12T03:00:00.000Z');

  assert.equal(getLoyaltyPointExpiryAt({ pointsExpiryPolicy: 'CYCLE_END' }, cycleEndAt, awardedAt).toISOString(), cycleEndAt.toISOString());
  assert.equal(getLoyaltyPointExpiryAt({ pointsExpiryPolicy: 'DAYS_AFTER_AWARD', pointsExpiryDays: 7 }, cycleEndAt, awardedAt).toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(getLoyaltyPointExpiryAt({ pointsExpiryPolicy: 'NEVER' }, cycleEndAt, awardedAt), null);
});
