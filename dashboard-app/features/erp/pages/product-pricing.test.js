import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProductPricing, parseBRL, priceFromMarkup } from './product-pricing.js';

test('calculates gross margin against effective selling price and markup against cost', () => {
  assert.deepEqual(calculateProductPricing({ cost: 'R$ 6,00', price: 'R$ 10,00', discount: '0' }), {
    effectivePrice: 10,
    profitValue: 4,
    profitMarginPercent: 40,
    markupPercent: 66.67,
  });
});

test('uses discount when no promotional price is set', () => {
  const pricing = calculateProductPricing({ cost: 'R$ 6,00', price: 'R$ 10,00', promotionalPrice: '', discount: '20' });
  assert.equal(pricing.effectivePrice, 8);
  assert.equal(pricing.profitValue, 2);
  assert.equal(pricing.profitMarginPercent, 25);
});

test('uses explicit promotional price instead of regular-price discount', () => {
  const pricing = calculateProductPricing({ cost: 'R$ 6,00', price: 'R$ 10,00', promotionalPrice: 'R$ 7,00', discount: '20' });
  assert.equal(pricing.effectivePrice, 7);
  assert.equal(pricing.profitValue, 1);
  assert.equal(pricing.profitMarginPercent, 14.29);
});

test('updates the displayed markup when the selling price is changed manually', () => {
  assert.equal(calculateProductPricing({ cost: 'R$ 8,00', price: 'R$ 12,00' }).markupPercent, 50);
});

test('applies markup to cost with currency parsing and cent rounding', () => {
  assert.equal(parseBRL('R$ 12,34'), 12.34);
  assert.equal(parseBRL('12.34'), 12.34);
  assert.equal(priceFromMarkup('R$ 10,00', '12,5'), 11.25);
});
