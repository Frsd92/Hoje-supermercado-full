import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateLoyaltyMissionPayload,
  validateLoyaltyRewardPayload,
} from './mission-validation.js';
import {
  canonicalizeLoyaltyMissionDestinationPath,
  getLoyaltyMissionDestinationHref,
} from './mission-destinations.js';

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

test('validates missions that repeat after a customer-specific completion cooldown', () => {
  const mission = validateLoyaltyMissionPayload({
    ...baseMission,
    recurrence: 'after_days',
    recurrenceDays: '14',
  });
  assert.equal(mission.recurrence, 'after_days');
  assert.equal(mission.recurrenceDays, 14);

  assert.throws(() => validateLoyaltyMissionPayload({
    ...baseMission,
    recurrence: 'after_days',
    recurrenceDays: 0,
  }), /intervalo para repetir/);
  assert.throws(() => validateLoyaltyMissionPayload({
    ...baseMission,
    ruleType: 'FIRST_PURCHASE',
    recurrence: 'after_days',
    recurrenceDays: 14,
  }), /não pode se repetir/);
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

test('migrates the former beverage destination to Sucos e Refrigerantes', () => {
  const legacyDestination = '/categoria.html?categoria=bebidas';
  const currentDestination = '/categoria.html?categoria=sucos';

  assert.equal(canonicalizeLoyaltyMissionDestinationPath(legacyDestination), currentDestination);
  assert.equal(
    validateLoyaltyMissionPayload({ ...baseMission, destinationPath: legacyDestination }).destinationPath,
    currentDestination,
  );
  assert.equal(getLoyaltyMissionDestinationHref(legacyDestination), currentDestination);
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
    maximumDiscountAmount: '20',
    minimumOrderAmount: '80.50',
    cooldownDays: '14',
    validityDays: '14',
    active: true,
  });

  assert.equal(reward.minimumOrderAmount, 80.5);
  assert.equal(reward.pointsCost, 250);
  assert.equal(reward.validityDays, 14);
  assert.equal(reward.benefitType, 'PERCENTAGE');
  assert.equal(reward.maximumDiscountAmount, 20);
  assert.equal(reward.cooldownDays, 14);
  const fixedReward = validateLoyaltyRewardPayload({
    name: 'Cupom de R$ 14',
    pointsCost: 1400,
    benefitType: 'FIXED_AMOUNT',
    discountAmount: 14,
    minimumOrderAmount: 140,
    validityDays: 30,
  });
  assert.equal(fixedReward.discountAmount, 14);
  assert.equal(fixedReward.discountPercent, 0);
  assert.equal(fixedReward.pointsCost, 1400);
  assert.throws(() => validateLoyaltyRewardPayload({
    name: 'Cupom de R$ 14',
    pointsCost: 1401,
    benefitType: 'FIXED_AMOUNT',
    discountAmount: 14,
    minimumOrderAmount: 0,
    validityDays: 30,
  }), /custo em pontos/);
  const freeDeliveryReward = validateLoyaltyRewardPayload({
    name: 'Entrega por pontos',
    benefitType: 'FREE_DELIVERY',
    pointsCost: 300,
    minimumOrderRequired: false,
    minimumOrderAmount: 80,
    validityDays: 14,
    active: true,
  });
  assert.equal(freeDeliveryReward.discountPercent, 0);
  assert.equal(freeDeliveryReward.benefitType, 'FREE_DELIVERY');
  assert.equal(freeDeliveryReward.minimumOrderAmount, 0);
  assert.equal(freeDeliveryReward.cooldownDays, 0);
  assert.throws(() => validateLoyaltyRewardPayload({
    name: 'Intervalo inválido',
    pointsCost: 100,
    discountPercent: 10,
    cooldownDays: 3651,
    validityDays: 30,
  }), /intervalo para novo resgate/);
  assert.throws(() => validateLoyaltyRewardPayload({
    name: 'Cupom com mínimo inválido',
    pointsCost: 300,
    discountPercent: 10,
    minimumOrderRequired: true,
    minimumOrderAmount: 0,
    validityDays: 14,
  }), /pedido mínimo/);
  assert.throws(() => validateLoyaltyRewardPayload({
    name: 'Desconto inválido',
    pointsCost: 100,
    discountPercent: 100,
    minimumOrderAmount: 0,
    validityDays: 30,
  }), /desconto percentual/);
});
