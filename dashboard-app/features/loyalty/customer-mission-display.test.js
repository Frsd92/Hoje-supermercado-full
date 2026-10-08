import assert from 'node:assert/strict';
import test from 'node:test';
import { describeMission, missionProgress } from './customer-mission-display.js';

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

test('describes weekly purchase missions', () => {
  assert.equal(
    describeMission({ ruleType: 'PURCHASE_FREQUENCY', targetCount: 2, recurrence: 'weekly' }),
    'Conclua 2 pedido(s) nesta semana.',
  );
});
