import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSalePrice } from './product-pricing.js';

test('uses an explicit promotional price before percentage discount', () => {
  assert.equal(calculateSalePrice({ price: 58.43, promotionalPrice: 49.9, discount: 10 }), 49.9);
});

test('uses the percentage discount when no promotional price is set', () => {
  assert.equal(calculateSalePrice({ price: 10, promotionalPrice: 0, discount: 20 }), 8);
});

test('uses the regular price when there is no promotion or discount', () => {
  assert.equal(calculateSalePrice({ price: 10, promotionalPrice: 0, discount: 0 }), 10);
});

test('parses prices and discounts formatted in Brazilian Portuguese', () => {
  assert.equal(calculateSalePrice({ price: 'R$ 58,43', promotionalPrice: '', discount: '12,5' }), 51.13);
});
