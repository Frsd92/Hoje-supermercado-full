import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLoyaltyMissionPayload,
  validateLoyaltyRewardPayload,
} from './mission-validation.js';
import { getLoyaltyMissionDestinationHref } from './mission-destinations.js';

const baseMission = {
  name: 'Compras da semana',
  description: 'Acumule compras e ganhe pontos.',
  ruleType: 'MINIMUM_SPEND',
  targetAmount: '150.00',
  targetCount: 1,
  pointsReward: 100,
  rewardLimit: '',
  recurrence: 'weekly',
  startsAt: '2026-10-07T12:00:00.000Z',
  endsAt: null,
  pointsExpiryPolicy: 'CYCLE_END',
  status: 'draft',
};

test('validates recurring weekly spend missions and normalizes irrelevant fields', () => {
  const mission = validateLoyaltyMissionPayload(baseMission);

  assert.equal(mission.targetAmount, 150);
  assert.equal(mission.category, null);
  assert.equal(mission.destinationPath, null);
  assert.equal(mission.rewardLimit, null);
  assert.equal(mission.pointsExpiryDays, null);
  assert.equal(mission.pointsExpireAt, null);
});

test('validates optional store destinations and defaults the customer action to the store', () => {
  const wineDestination = '/categoria.html?categoria=vinhos';
  const mission = validateLoyaltyMissionPayload({ ...baseMission, destinationPath: wineDestination });

  assert.equal(mission.destinationPath, wineDestination);
  assert.equal(getLoyaltyMissionDestinationHref(mission.destinationPath), wineDestination);
  assert.equal(getLoyaltyMissionDestinationHref(null), '/index.html');
  assert.throws(
    () => validateLoyaltyMissionPayload({ ...baseMission, destinationPath: 'https://example.com' }),
    /página de destino válida/,
  );
});

test('accepts, clears, and preserves optional mission thumbnails', () => {
  const imageData = 'data:image/png;base64,iVBORw0KGgo=';
  const missionWithImage = validateLoyaltyMissionPayload({ ...baseMission, imageData });
  assert.equal(missionWithImage.imageData, 'iVBORw0KGgo=');
  assert.equal(missionWithImage.imageContentType, 'image/png');

  const missionWithoutImage = validateLoyaltyMissionPayload(baseMission);
  assert.equal(Object.hasOwn(missionWithoutImage, 'imageData'), false);

  const missionWithImageRemoved = validateLoyaltyMissionPayload({ ...baseMission, imageData: null });
  assert.equal(missionWithImageRemoved.imageData, null);
  assert.equal(missionWithImageRemoved.imageContentType, null);

  assert.throws(
    () => validateLoyaltyMissionPayload({ ...baseMission, imageData: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    /miniatura deve ser PNG, JPEG ou WebP/,
  );
});

test('prevents first-purchase missions from repeating and requires expiry settings', () => {
  assert.throws(() => validateLoyaltyMissionPayload({
    ...baseMission,
    ruleType: 'FIRST_PURCHASE',
    recurrence: 'weekly',
  }), /não pode se repetir/);

  assert.throws(() => validateLoyaltyMissionPayload({
    ...baseMission,
    pointsExpiryPolicy: 'DAYS_AFTER_AWARD',
    pointsExpiryDays: '',
  }), /validade em dias/);

  assert.throws(() => validateLoyaltyMissionPayload({
    ...baseMission,
    pointsExpiryPolicy: 'FIXED_DATE',
    pointsExpireAt: '2026-12-01T00:00:00.000Z',
  }), /encerramento da missão/);
});

test('validates reward discounts, point costs, and minimum-order amounts', () => {
  const reward = validateLoyaltyRewardPayload({
    name: 'Desconto especial',
    pointsCost: '250',
    discountPercent: '15',
    minimumOrderAmount: '80.50',
    validityDays: '14',
    active: true,
  });

  assert.equal(reward.minimumOrderAmount, 80.5);
  assert.equal(reward.pointsCost, 250);
  assert.equal(reward.validityDays, 14);
  assert.throws(() => validateLoyaltyRewardPayload({
    name: 'Desconto inválido',
    pointsCost: 100,
    discountPercent: 100,
    minimumOrderAmount: 0,
    validityDays: 30,
  }), /desconto percentual/);
});
