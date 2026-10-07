import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpenFoodFactsProductName, normalizeProductBarcode } from './product-barcode-lookup.js';

test('normalizes scanned GTINs without removing meaningful digits', () => {
  assert.equal(normalizeProductBarcode(' 789-1234-567890 '), '7891234567890');
  assert.equal(normalizeProductBarcode('00123456'), '00123456');
});

test('rejects unsupported lengths and non-numeric barcode values', () => {
  assert.equal(normalizeProductBarcode('1234567'), '');
  assert.equal(normalizeProductBarcode('123456789012345'), '');
  assert.equal(normalizeProductBarcode('INTERNAL-123'), '');
});

test('prefers a Portuguese product name and falls back to the general name', () => {
  assert.equal(getOpenFoodFactsProductName({
    product: { product_name_pt: '  Café torrado  ', product_name: 'Coffee' },
  }), 'Café torrado');
  assert.equal(getOpenFoodFactsProductName({
    product: { product_name_pt: '', product_name: 'Coffee' },
  }), 'Coffee');
});

test('returns no suggestion for an unknown or unnamed product', () => {
  assert.equal(getOpenFoodFactsProductName({ result: { id: 'product_not_found' } }), '');
  assert.equal(getOpenFoodFactsProductName({ product: { product_name: '   ' } }), '');
});
