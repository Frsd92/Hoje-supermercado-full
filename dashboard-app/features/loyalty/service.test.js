import test from 'node:test';
import assert from 'node:assert/strict';
import { awardCompletedOrderMissions } from './service.js';

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
