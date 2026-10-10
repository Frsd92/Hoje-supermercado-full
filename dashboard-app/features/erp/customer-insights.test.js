import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerCouponInsights, getCustomerMissionInsights } from './customer-insights.js';

test('classifies customer coupons by availability, expiry, use, and origin', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const campaigns = [
    {
      code: 'DISPONIVEL',
      discountPercent: 10,
      minimumOrderAmount: '20',
      expiresAt: new Date('2026-10-20T12:00:00.000Z'),
      createdBy: 'ERP',
      recipients: [{ email: ' cliente@example.com ' }],
      redemptions: [],
      loyaltyRedemption: null,
    },
    {
      code: 'EXPIRADO',
      discountPercent: 15,
      minimumOrderAmount: '0',
      expiresAt: new Date('2026-10-01T12:00:00.000Z'),
      createdBy: 'ERP',
      recipients: [{ email: 'cliente@example.com' }],
      redemptions: [],
      loyaltyRedemption: null,
    },
    {
      code: 'PONTOS',
      discountPercent: 20,
      minimumOrderAmount: '0',
      expiresAt: new Date('2026-10-20T12:00:00.000Z'),
      createdBy: 'Programa de pontos Hoje',
      recipients: [{ email: 'cliente@example.com' }],
      redemptions: [{ email: 'cliente@example.com', orderId: 'order-1', createdAt: now }],
      loyaltyRedemption: { reward: { name: 'Desconto fidelidade' } },
    },
  ];
  const result = getCustomerCouponInsights(campaigns, [
    { id: 'order-1', couponCode: 'PONTOS', customerEmail: 'cliente@example.com', status: 'Concluido', paymentStatus: 'paid', createdAt: now },
  ], 'CLIENTE@example.com', now);

  assert.deepEqual(result.couponCounts, { available: 1, expiredUnused: 1, used: 1, processing: 0 });
  assert.equal(result.coupons.find((coupon) => coupon.code === 'PONTOS').source, 'missões e pontos');
  assert.equal(result.coupons.find((coupon) => coupon.code === 'DISPONIVEL').source, 'área de cupons');
});

test('lists active mission progress and flags customers at 75 percent or more', () => {
  const missions = [
    { id: 'near', name: 'Compras do mês', ruleType: 'MINIMUM_SPEND', targetAmount: 100, targetCount: 1 },
    { id: 'early', name: 'Pedidos', ruleType: 'PURCHASE_FREQUENCY', targetAmount: 0, targetCount: 4 },
    { id: 'done', name: 'Concluída', ruleType: 'PURCHASE_FREQUENCY', targetAmount: 0, targetCount: 2 },
  ];
  const progress = [
    { missionId: 'near', customerEmail: 'cliente@example.com', progressAmount: 80, progressCount: 0, completedAt: null },
    { missionId: 'early', customerEmail: 'cliente@example.com', progressAmount: 0, progressCount: 1, completedAt: null },
    { missionId: 'done', customerEmail: 'cliente@example.com', progressAmount: 0, progressCount: 2, completedAt: new Date() },
    { missionId: 'near', customerEmail: 'outra@example.com', progressAmount: 99, progressCount: 0, completedAt: null },
  ];

  const result = getCustomerMissionInsights(missions, progress, 'cliente@example.com');
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'near');
  assert.equal(result[0].percent, 80);
  assert.equal(result[0].nearCompletion, true);
  assert.equal(result[1].nearCompletion, false);
});

test('keeps pending coupon orders in processing and ignores canceled orders', () => {
  const campaigns = ['PENDENTE', 'CANCELADO'].map((code) => ({
    code,
    discountPercent: 10,
    minimumOrderAmount: 0,
    expiresAt: new Date('2026-10-20T12:00:00.000Z'),
    createdBy: 'ERP',
    recipients: [{ email: 'cliente@example.com' }],
    redemptions: [],
    loyaltyRedemption: null,
  }));
  const result = getCustomerCouponInsights(campaigns, [
    { id: 'order-1', couponCode: 'PENDENTE', status: 'Em processamento', paymentStatus: 'pending', createdAt: new Date() },
    { id: 'order-2', couponCode: 'CANCELADO', status: 'Cancelado', paymentStatus: 'pending', createdAt: new Date() },
  ], 'cliente@example.com');

  assert.equal(result.couponCounts.processing, 1);
  assert.equal(result.couponCounts.available, 1);
});
