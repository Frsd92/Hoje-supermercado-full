import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProductCest } from './product-cest.js';

test('normalizes a formatted CEST to seven digits', () => {
  assert.equal(normalizeProductCest('12.345.67'), '1234567');
  assert.equal(normalizeProductCest(' 1234567 '), '1234567');
});

test('allows an empty CEST and rejects malformed values', () => {
  assert.equal(normalizeProductCest(''), '');
  assert.throws(() => normalizeProductCest('123456'), /exatamente 7 dígitos/);
  assert.throws(() => normalizeProductCest('12345678'), /exatamente 7 dígitos/);
  assert.throws(() => normalizeProductCest('12A4567'), /exatamente 7 dígitos/);
});
