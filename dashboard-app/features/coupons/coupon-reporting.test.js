import assert from 'node:assert/strict';
import test from 'node:test';
import { getCouponRecipientStatus, summarizeCouponCampaign } from './coupon-reporting.js';

const now = new Date('2026-10-05T12:00:00.000Z');

test('reports redeemed coupons before considering expiry', () => {
  assert.equal(getCouponRecipientStatus('2026-10-04T00:00:00.000Z', { createdAt: now }, now), 'redeemed');
  assert.equal(getCouponRecipientStatus('2026-10-06T00:00:00.000Z', null, now), 'available');
  assert.equal(getCouponRecipientStatus('2026-10-04T00:00:00.000Z', null, now), 'expired');
});

test('summarizes campaign reach, redemptions, net sales and recipient history', () => {
  const campaign = {
    id: 'CPN-1',
    code: 'BEMVINDO10',
    discountPercent: 10,
    message: 'Aproveite seu cupom.',
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    expiresAt: new Date('2026-10-12T12:00:00.000Z'),
    recipients: [
      { email: 'cliente1@example.com' },
      { email: 'CLIENTE2@example.com' },
      { email: 'cliente3@example.com' },
    ],
    redemptions: [{
      email: 'cliente1@example.com',
      orderId: 'PED-1',
      createdAt: new Date('2026-10-03T12:00:00.000Z'),
    }],
  };
  const orders = [
    {
      id: 'PED-1',
      couponCode: 'BEMVINDO10',
      customerEmail: 'cliente1@example.com',
      total: 'R$ 90,00',
      couponDiscountAmount: '10.00',
      status: 'Concluido',
      createdAt: new Date('2026-10-03T12:00:00.000Z'),
    },
    {
      id: 'PED-2',
      couponCode: 'BEMVINDO10',
      customerEmail: 'cliente2@example.com',
      total: 'R$ 45,00',
      couponDiscountAmount: 5,
      status: 'Cancelado',
      createdAt: new Date('2026-10-04T12:00:00.000Z'),
    },
  ];

  const report = summarizeCouponCampaign(campaign, orders, now);

  assert.equal(report.status, 'active');
  assert.equal(report.recipientsCount, 3);
  assert.equal(report.redeemedCount, 2);
  assert.equal(report.availableCount, 1);
  assert.equal(report.expiredCount, 0);
  assert.equal(report.redemptionRate, 66.7);
  assert.equal(report.ordersCount, 1);
  assert.equal(report.cancelledOrdersCount, 1);
  assert.equal(report.revenue, 90);
  assert.equal(report.discountGiven, 10);
  assert.deepEqual(report.recipientStatuses.map(({ status }) => status), ['redeemed', 'redeemed', 'available']);
  assert.equal(report.recipientStatuses[1].orderStatus, 'Cancelado');
  assert.equal(report.recipientStatuses[2].email, 'cliente3@example.com');
});

test('marks an unredeemed campaign expired and a current campaign fully redeemed', () => {
  const baseCampaign = {
    id: 'CPN-2',
    code: 'SEMESTRE',
    discountPercent: 15,
    createdAt: new Date('2026-10-01T12:00:00.000Z'),
    recipients: [{ email: 'cliente@example.com' }],
    redemptions: [],
  };
  const expired = summarizeCouponCampaign({
    ...baseCampaign,
    expiresAt: new Date('2026-10-04T12:00:00.000Z'),
  }, [], now);
  const fullyRedeemed = summarizeCouponCampaign({
    ...baseCampaign,
    expiresAt: new Date('2026-10-12T12:00:00.000Z'),
    redemptions: [{ email: 'cliente@example.com', orderId: 'PED-3', createdAt: now }],
  }, [], now);

  assert.equal(expired.status, 'expired');
  assert.equal(expired.expiredCount, 1);
  assert.equal(fullyRedeemed.status, 'fully_redeemed');
  assert.equal(fullyRedeemed.availableCount, 0);
});
