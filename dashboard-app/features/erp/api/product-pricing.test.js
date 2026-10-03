import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSalePrice,
  getFlashOfferStatus,
  validateFlashOfferConfiguration,
} from './product-pricing.js';

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

test('uses a flash offer only while its scheduled window is active', () => {
  const product = {
    price: 20,
    flashOfferEnabled: true,
    flashOfferPrice: 12.5,
    flashOfferStart: '2026-05-01T10:00:00.000Z',
    flashOfferEnd: '2026-05-01T12:00:00.000Z',
  };
  const now = Date.parse('2026-05-01T11:00:00.000Z');

  assert.equal(getFlashOfferStatus(product, now).state, 'active');
  assert.equal(calculateSalePrice(product, now), 12.5);
});

test('keeps the regular sale price before a scheduled offer and after it expires', () => {
  const product = {
    price: 20,
    discount: 10,
    flashOfferEnabled: true,
    flashOfferPrice: 12,
    flashOfferStart: '2026-05-01T10:00:00.000Z',
    flashOfferEnd: '2026-05-01T12:00:00.000Z',
  };

  assert.equal(getFlashOfferStatus(product, Date.parse('2026-05-01T09:00:00.000Z')).state, 'scheduled');
  assert.equal(calculateSalePrice(product, Date.parse('2026-05-01T09:00:00.000Z')), 18);
  assert.equal(getFlashOfferStatus(product, Date.parse('2026-05-01T12:00:00.000Z')).state, 'expired');
  assert.equal(calculateSalePrice(product, Date.parse('2026-05-01T12:00:00.000Z')), 18);
});

test('validates a flash price against the current sale price and its time window', () => {
  const product = { price: 20, discount: 10, status: 'Ativo' };
  const validInput = {
    flashOfferPrice: '15,00',
    flashOfferStart: '2026-05-01T10:00:00.000Z',
    flashOfferEnd: '2026-05-01T12:00:00.000Z',
  };

  assert.equal(
    validateFlashOfferConfiguration(product, validInput, Date.parse('2026-05-01T09:00:00.000Z')).value.flashOfferPrice,
    15,
  );
  assert.match(
    validateFlashOfferConfiguration(product, { ...validInput, flashOfferPrice: 18 }).error,
    /menor que o preço de venda atual/,
  );
  assert.match(
    validateFlashOfferConfiguration(product, {
      ...validInput,
      flashOfferStart: '2026-05-01T07:00:00.000Z',
      flashOfferEnd: '2026-05-01T08:00:00.000Z',
    }, Date.parse('2026-05-01T09:00:00.000Z')).error,
    /término da oferta precisa estar no futuro/,
  );
});
