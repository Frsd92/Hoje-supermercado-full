import test from 'node:test';
import assert from 'node:assert/strict';
import { awardCompletedOrderMissions, getCustomerLoyaltySnapshot } from './service.js';

test('returns active customer missions and all active rewards with the mission destination', async () => {
  const now = new Date('2026-10-08T12:00:00.000Z');
  const mission = {
    id: 'mission-1',
    name: 'Compra em vinhos',
    description: '',
    ruleType: 'MINIMUM_SPEND',
    targetAmount: 100,
    targetCount: 1,
    category: null,
    destinationPath: '/categoria.html?categoria=vinhos',
    pointsReward: 20,
    recurrence: 'none',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: null,
    pointsExpiryPolicy: 'NEVER',
    rewardLimit: null,
    claimedRewards: 0,
    imageContentType: null,
    updatedAt: now,
  };
  const rewards = ['tesla10', 'Cupom de 10%'].map((name, index) => ({
    id: `reward-${index + 1}`,
    name,
    description: '',
    pointsCost: 100,
    discountPercent: 10,
    minimumOrderAmount: 0,
    validityDays: 30,
    _count: { redemptions: 0 },
  }));
  let missionQuery;
  const transaction = {
    loyaltyMission: {
      findMany: async (query) => {
        missionQuery = query;
        return [mission];
      },
    },
    loyaltyMissionProgress: { findMany: async () => [] },
    loyaltyPointEntry: { findMany: async () => [] },
    loyaltyReward: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { active: true });
        return rewards;
      },
    },
  };

  const snapshot = await getCustomerLoyaltySnapshot(transaction, 'Cliente@exemplo.com', now);

  assert.equal(missionQuery.where.status, 'active');
  assert.equal(missionQuery.select.destinationPath, true);
  assert.equal(snapshot.missions.length, 1);
  assert.equal(snapshot.missions[0].destinationPath, mission.destinationPath);
  assert.deepEqual(snapshot.rewards.map((reward) => reward.name), ['tesla10', 'Cupom de 10%']);
  assert.deepEqual(snapshot.expiringPoints, {
    points: 0,
    expiresAt: null,
    daysRemaining: null,
    windowDays: 30,
  });
});

test('reports net points nearing expiry and the status of previously redeemed coupons', async () => {
  const now = new Date('2026-10-08T12:00:00.000Z');
  const redemptionAt = new Date('2026-10-07T12:00:00.000Z');
  const campaignExpiry = new Date('2026-11-07T12:00:00.000Z');
  const pointEntries = [
    {
      id: 'redemption-entry',
      type: 'REDEMPTION',
      points: -100,
      description: 'Resgate: Cupom de R$ 3',
      createdAt: redemptionAt,
      expiresAt: null,
      awardsAllocations: [],
      spendsAllocations: [{ points: 100 }],
      rewardRedemption: {
        reward: { name: 'Cupom de R$ 3' },
        couponCampaign: {
          id: 'CPN-1',
          code: 'PNT123',
          expiresAt: campaignExpiry,
          discountPercent: 0,
          discountAmount: 3,
          maximumDiscountAmount: null,
          benefitType: 'FIXED_AMOUNT',
          minimumOrderAmount: 30,
        },
      },
    },
    {
      id: 'award-entry',
      type: 'MISSION_AWARD',
      points: 500,
      description: 'Missão concluída',
      createdAt: redemptionAt,
      expiresAt: new Date('2026-10-28T12:00:00.000Z'),
      sourceOrder: null,
      awardsAllocations: [{ points: 100 }],
      spendsAllocations: [],
      rewardRedemption: null,
    },
  ];
  const transaction = {
    loyaltyMission: { findMany: async () => [] },
    loyaltyMissionProgress: { findMany: async () => [] },
    loyaltyPointEntry: { findMany: async () => pointEntries },
    loyaltyReward: { findMany: async () => [] },
    couponRedemption: {
      findMany: async ({ where }) => {
        assert.deepEqual(where, { campaignId: { in: ['CPN-1'] }, email: 'cliente@example.com' });
        return [{ campaignId: 'CPN-1', orderId: 'ORDER-1', createdAt: redemptionAt }];
      },
    },
    order: {
      findMany: async ({ where }) => {
        assert.deepEqual(where.id.in, ['ORDER-1']);
        return [{ id: 'ORDER-1', status: 'Concluido', paymentStatus: 'paid' }];
      },
    },
  };

  const snapshot = await getCustomerLoyaltySnapshot(transaction, 'cliente@example.com', now);

  assert.equal(snapshot.balance, 400);
  assert.deepEqual(snapshot.expiringPoints, {
    points: 400,
    expiresAt: '2026-10-28T12:00:00.000Z',
    daysRemaining: 20,
    windowDays: 30,
  });
  assert.equal(snapshot.history[0].coupon.status, 'redeemed');
  assert.equal(snapshot.history[0].coupon.discountAmount, 3);
  assert.equal(snapshot.history[0].couponCode, 'PNT123');
});

test('awards a completed mission once and caps its global reward count', async () => {
  const completedAt = new Date('2026-10-08T12:00:00.000Z');
  const mission = {
    id: 'mission-1',
    name: 'Compra especial',
    status: 'active',
    ruleType: 'MINIMUM_SPEND',
    targetAmount: 100,
    targetCount: 1,
    pointsReward: 50,
    rewardLimit: 1,
    claimedRewards: 0,
    recurrence: 'none',
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: null,
    pointsExpiryPolicy: 'NEVER',
  };
  const order = {
    id: 'PED-1',
    customerEmail: 'cliente@example.com',
    status: 'Concluido',
    paymentStatus: 'paid',
    total: 'R$ 100,00',
    subtotal: 100,
    refundedAmount: 0,
    updatedAt: completedAt,
    items: [],
  };
  let progress = null;
  let claimedRewards = 0;
  const contributions = [];
  let pointEntries = [];
  const transaction = {
    order: {
      findUnique: async () => order,
      count: async () => 0,
    },
    loyaltyMission: {
      findMany: async () => [mission],
      updateMany: async () => {
        if (mission.status !== 'active' || claimedRewards >= mission.rewardLimit) return { count: 0 };
        claimedRewards += 1;
        return { count: 1 };
      },
      update: async ({ data }) => {
        claimedRewards += data.claimedRewards.decrement;
        return mission;
      },
    },
    loyaltyMissionProgress: {
      findUnique: async () => progress,
      upsert: async ({ create }) => {
        progress ||= { id: 'progress-1', ...create, progressCount: 0, progressAmount: 0, completedAt: null };
        return progress;
      },
      update: async ({ data }) => {
        progress = {
          ...progress,
          ...(data.progressCount ? { progressCount: progress.progressCount + data.progressCount.increment } : {}),
          ...(data.progressAmount ? { progressAmount: progress.progressAmount + Number(data.progressAmount.increment) } : {}),
          ...(data.completedAt ? { completedAt: data.completedAt, pointsAwarded: data.pointsAwarded } : {}),
        };
        return progress;
      },
    },
    loyaltyMissionContribution: {
      createMany: async ({ data }) => {
        contributions.push(...data);
        return { count: data.length };
      },
      findMany: async () => contributions.map((contribution) => ({
        orderId: contribution.orderId,
        contributionAmount: contribution.contributionAmount,
        contributionCount: contribution.contributionCount,
      })),
    },
    loyaltyPointEntry: {
      createMany: async ({ data }) => {
        pointEntries = data;
        return { count: data.length };
      },
    },
  };

  assert.deepEqual(await awardCompletedOrderMissions(transaction, order.id), ['mission-1']);
  assert.deepEqual(await awardCompletedOrderMissions(transaction, order.id), []);
  assert.equal(claimedRewards, 1);
  assert.equal(pointEntries.length, 1);
  assert.equal(pointEntries[0].points, 50);
  assert.equal(pointEntries[0].customerEmail, 'cliente@example.com');
});
