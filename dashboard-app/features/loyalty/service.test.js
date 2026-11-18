import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awardCompletedOrderMissions,
  getCustomerLoyaltySnapshot,
  redeemLoyaltyReward,
} from './service.js';

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
        createdAt: redemptionAt,
        cooldownDays: 14,
        reward: { id: 'reward-1', name: 'Cupom de R$ 3' },
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
  assert.equal(snapshot.history[0].coupon.daysUntilRedeemAgain, 13);
  assert.equal(snapshot.history[0].coupon.redeemAgainAt, '2026-10-21T12:00:00.000Z');
});

test('shows the remaining mission cooldown in the customer snapshot', async () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const previousProgress = {
    missionId: 'mission-cooldown',
    customerEmail: 'cliente@example.com',
    cycleStartAt: new Date('2026-10-01T12:00:00.000Z'),
    cycleEndAt: new Date('2026-10-22T12:00:00.000Z'),
    progressCount: 1,
    progressAmount: 100,
    completedAt: new Date('2026-10-15T12:00:00.000Z'),
    pointsAwarded: 20,
  };
  const transaction = {
    loyaltyMission: {
      findMany: async () => [{
        id: 'mission-cooldown',
        name: 'Missão com intervalo',
        description: '',
        ruleType: 'MINIMUM_SPEND',
        targetAmount: 100,
        targetCount: 1,
        destinationPath: null,
        pointsReward: 20,
        recurrence: 'after_days',
        recurrenceDays: 7,
        startsAt: new Date('2026-10-01T12:00:00.000Z'),
        endsAt: null,
        pointsExpiryPolicy: 'CYCLE_END',
        rewardLimit: null,
        claimedRewards: 1,
        imageContentType: null,
        updatedAt: now,
      }],
    },
    loyaltyMissionProgress: {
      findMany: async ({ where }) => (where.missionId?.in ? [previousProgress] : []),
    },
    loyaltyPointEntry: { findMany: async () => [] },
    loyaltyReward: { findMany: async () => [] },
  };

  const snapshot = await getCustomerLoyaltySnapshot(transaction, 'cliente@example.com', now);
  assert.equal(snapshot.missions.length, 1);
  assert.equal(snapshot.missions[0].completedAt, '2026-10-15T12:00:00.000Z');
  assert.equal(snapshot.missions[0].cooldownActive, true);
  assert.equal(snapshot.missions[0].cooldownDaysRemaining, 2);
  assert.equal(snapshot.missions[0].availableAgainAt, '2026-10-22T12:00:00.000Z');
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
    recurrence: 'after_days',
    recurrenceDays: 7,
    startsAt: new Date('2026-10-01T00:00:00.000Z'),
    endsAt: null,
    pointsExpiryPolicy: 'CYCLE_END',
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
      findFirst: async () => progress,
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
          ...(data.completedAt ? {
            completedAt: data.completedAt,
            pointsAwarded: data.pointsAwarded,
            cycleEndAt: data.cycleEndAt,
          } : {}),
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
  assert.equal(pointEntries[0].expiresAt.toISOString(), '2026-10-15T12:00:00.000Z');
});

test('keeps a completed mission unavailable until its customer cooldown ends', async () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const previousProgress = {
    missionId: 'mission-cooldown',
    customerEmail: 'cliente@example.com',
    cycleStartAt: new Date('2026-10-01T00:00:00.000Z'),
    completedAt: new Date('2026-10-15T12:00:00.000Z'),
  };
  const transaction = {
    order: {
      findUnique: async () => ({
        id: 'PED-COOLDOWN',
        customerEmail: 'cliente@example.com',
        status: 'Concluido',
        paymentStatus: 'paid',
        total: 100,
        subtotal: 100,
        refundedAmount: 0,
        updatedAt: now,
        items: [],
      }),
    },
    loyaltyMission: {
      findMany: async () => [{
        id: 'mission-cooldown',
        name: 'Missão com intervalo',
        status: 'active',
        ruleType: 'MINIMUM_SPEND',
        targetAmount: 50,
        targetCount: 1,
        pointsReward: 20,
        rewardLimit: null,
        claimedRewards: 1,
        recurrence: 'after_days',
        recurrenceDays: 7,
        startsAt: new Date('2026-10-01T00:00:00.000Z'),
        endsAt: null,
        pointsExpiryPolicy: 'NEVER',
      }],
    },
    loyaltyMissionProgress: {
      findFirst: async () => previousProgress,
      findUnique: async () => {
        throw new Error('Uma missão em intervalo não deve aceitar progresso.');
      },
    },
  };

  assert.deepEqual(await awardCompletedOrderMissions(transaction, 'PED-COOLDOWN'), []);
});

test('blocks a repeat reward redemption until the previous cooldown ends', async () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const transaction = {
    loyaltyRewardRedemption: {
      findUnique: async () => null,
      findFirst: async () => ({
        createdAt: new Date('2026-10-13T12:00:00.000Z'),
        cooldownDays: 14,
      }),
    },
    loyaltyReward: {
      findUnique: async () => ({ id: 'reward-1', active: true, pointsCost: 100, cooldownDays: 10 }),
    },
  };

  const result = await redeemLoyaltyReward(transaction, {
    customerEmail: 'cliente@example.com',
    rewardId: 'reward-1',
    requestId: 'request-1',
    now,
  });
  assert.equal(result.status, 409);
  assert.match(result.error, /7 dia\(s\)/);
});

test('stores the reward cooldown on each new redemption', async () => {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const award = {
    id: 'award-1',
    type: 'MISSION_AWARD',
    points: 100,
    createdAt: new Date('2026-10-19T12:00:00.000Z'),
    expiresAt: null,
    sourceOrder: null,
    awardsAllocations: [],
    spendsAllocations: [],
  };
  const reward = {
    id: 'reward-1',
    name: 'Desconto especial',
    active: true,
    pointsCost: 100,
    discountPercent: 10,
    discountAmount: 0,
    maximumDiscountAmount: null,
    benefitType: 'PERCENTAGE',
    minimumOrderAmount: 0,
    validityDays: 30,
    cooldownDays: 5,
  };
  const campaign = {
    id: 'campaign-1',
    code: 'PNT123',
    discountPercent: 10,
    discountAmount: 0,
    maximumDiscountAmount: null,
    minimumOrderAmount: 0,
    expiresAt: new Date('2026-11-19T12:00:00.000Z'),
  };
  const transaction = {
    loyaltyRewardRedemption: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async ({ data }) => ({ ...data, createdAt: now }),
    },
    loyaltyReward: { findUnique: async () => reward },
    loyaltyPointEntry: {
      findMany: async () => [award],
      create: async () => ({ id: 'redemption-entry' }),
    },
    couponCampaign: { create: async () => campaign },
    loyaltyPointAllocation: {
      createMany: async ({ data }) => {
        assert.deepEqual(data, [{ redemptionEntryId: 'redemption-entry', awardEntryId: 'award-1', points: 100 }]);
        return { count: data.length };
      },
    },
  };

  const result = await redeemLoyaltyReward(transaction, {
    customerEmail: 'cliente@example.com',
    rewardId: reward.id,
    requestId: 'request-new',
    now,
  });
  assert.equal(result.redemption.cooldownDays, 5);
  assert.equal(result.redemption.redeemAgainAt, '2026-10-25T12:00:00.000Z');
});
