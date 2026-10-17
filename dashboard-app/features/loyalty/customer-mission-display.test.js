import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeMission,
  getClosestAvailableMission,
  getPointsProgressToNextReward,
  missionProgress,
} from './customer-mission-display.js';

test('formats spending mission progress as currency', () => {
  const progress = missionProgress({
    ruleType: 'MINIMUM_SPEND',
    progressAmount: 25,
    targetAmount: 100,
  });

  assert.match(progress.current, /25,00/);
  assert.match(progress.target, /100,00/);
  assert.equal(progress.percent, 25);
});

test('caps purchase-count progress at the goal', () => {
  assert.deepEqual(
    missionProgress({ ruleType: 'PURCHASE_FREQUENCY', progressCount: 3, targetCount: 2 }),
    { current: '3', target: '2', percent: 100 },
  );
});

test('chooses only the closest available mission for compact checkout progress', () => {
  const selected = getClosestAvailableMission([
    { id: 'early', name: 'Mais próxima', ruleType: 'PURCHASE_FREQUENCY', progressCount: 3, targetCount: 4 },
    { id: 'late', name: 'Mais distante', ruleType: 'MINIMUM_SPEND', progressAmount: 10, targetAmount: 100 },
    { id: 'complete', name: 'Concluída', ruleType: 'PURCHASE_FREQUENCY', progressCount: 2, targetCount: 2, completedAt: '2026-10-01' },
    { id: 'sold-out', name: 'Esgotada', ruleType: 'PURCHASE_FREQUENCY', progressCount: 4, targetCount: 5, soldOut: true },
  ]);

  assert.equal(selected.mission.id, 'early');
  assert.equal(selected.progress.percent, 75);
  assert.equal(getClosestAvailableMission([]), null);
});

test('describes weekly purchase missions', () => {
  assert.equal(
    describeMission({ ruleType: 'PURCHASE_FREQUENCY', targetCount: 2, recurrence: 'weekly' }),
    'Conclua 2 pedido(s) nesta semana.',
  );
});

test('tracks balance toward the next active reward and caps when all are redeemable', () => {
  const rewards = [
    { name: 'Recompensa maior', pointsCost: 250 },
    { name: 'Recompensa inicial', pointsCost: 100 },
  ];
  const progress = getPointsProgressToNextReward(80, rewards);

  assert.equal(progress.reward.name, 'Recompensa inicial');
  assert.equal(progress.targetPoints, 100);
  assert.equal(progress.pointsNeeded, 20);
  assert.equal(progress.percent, 80);
  assert.equal(progress.complete, false);

  const completed = getPointsProgressToNextReward(320, rewards);
  assert.equal(completed.targetPoints, 250);
  assert.equal(completed.pointsNeeded, 0);
  assert.equal(completed.percent, 100);
  assert.equal(completed.complete, true);
  assert.equal(getPointsProgressToNextReward(320, []), null);
});
