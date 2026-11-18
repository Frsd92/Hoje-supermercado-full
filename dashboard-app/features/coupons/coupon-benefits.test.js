import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCouponDiscountAmount,
  getCouponBenefitLabel,
  normalizeCouponBenefit,
  normalizeCouponMinimumOrderAmount,
} from './coupon-benefits.js';

test('normalizes fixed rewards and validates the optional percentage cap', () => {
  assert.deepEqual(normalizeCouponBenefit({
    benefitType: 'FIXED_AMOUNT',
    discountAmount: '14',
  }), {
    benefitType: 'FIXED_AMOUNT',
    discountPercent: 0,
    discountAmount: 14,
    maximumDiscountAmount: null,
  });
  assert.deepEqual(normalizeCouponBenefit({
    benefitType: 'PERCENTAGE',
    discountPercent: 10,
    maximumDiscountAmount: '12,50',
  }), {
    benefitType: 'PERCENTAGE',
    discountPercent: 10,
    discountAmount: 0,
    maximumDiscountAmount: 12.5,
  });
  assert.throws(() => normalizeCouponBenefit({
    benefitType: 'FIXED_AMOUNT',
    discountAmount: 7,
  }), /Escolha um desconto fixo/);
  assert.throws(() => normalizeCouponBenefit({
    benefitType: 'PERCENTAGE',
    discountPercent: 10,
    maximumDiscountAmount: 0,
  }), /desconto máximo/);
});

test('applies percentage caps and fixed coupons without exceeding the subtotal', () => {
  assert.equal(calculateCouponDiscountAmount(250, {
    benefitType: 'PERCENTAGE',
    discountPercent: 10,
    maximumDiscountAmount: 12,
  }), 12);
  assert.equal(calculateCouponDiscountAmount(250, {
    benefitType: 'PERCENTAGE',
    discountPercent: 10,
  }), 25);
  assert.equal(calculateCouponDiscountAmount(12, {
    benefitType: 'FIXED_AMOUNT',
    discountAmount: 20,
  }), 12);
  assert.equal(calculateCouponDiscountAmount(250, { benefitType: 'FREE_DELIVERY' }), 0);
});

test('labels fixed and capped coupons clearly', () => {
  assert.match(getCouponBenefitLabel('FIXED_AMOUNT', 0, 20), /^R\$\s20 de desconto$/);
  assert.match(getCouponBenefitLabel('PERCENTAGE', 10, 0, 12), /^10% de desconto \(até R\$\s12\)$/);
});

test('normalizes optional coupon minimums and keeps legacy positive amounts', () => {
  assert.equal(normalizeCouponMinimumOrderAmount({
    minimumOrderRequired: false,
    minimumOrderAmount: '80',
  }), 0);
  assert.equal(normalizeCouponMinimumOrderAmount({
    minimumOrderRequired: true,
    minimumOrderAmount: '80,50',
  }), 80.5);
  assert.equal(normalizeCouponMinimumOrderAmount({ minimumOrderAmount: 80 }), 80);
  assert.equal(normalizeCouponMinimumOrderAmount({}), 0);
  assert.throws(() => normalizeCouponMinimumOrderAmount({
    minimumOrderRequired: true,
    minimumOrderAmount: 0,
  }), /pedido mínimo/);
  assert.throws(() => normalizeCouponMinimumOrderAmount({
    minimumOrderRequired: 'true',
    minimumOrderAmount: 80,
  }), /compra mínima/);
});
