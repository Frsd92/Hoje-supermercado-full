import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesProductSearch } from './product-search.js';

const product = {
  id: 'product-1',
  title: 'Leite Integral',
  sku: 'LAC-123',
  barcode: '789 1234-5678',
  categories: ['Mercearia', 'Laticínios'],
  department: 'Alimentos',
};

test('searches products by name without accent or case sensitivity', () => {
  assert.equal(matchesProductSearch(product, 'LEITE integral'), true);
  assert.equal(matchesProductSearch(product, 'laticinios'), true);
});

test('searches products by barcode, SKU, category, and department', () => {
  assert.equal(matchesProductSearch(product, '78912345678'), true);
  assert.equal(matchesProductSearch(product, 'lac-123'), true);
  assert.equal(matchesProductSearch(product, 'mercearia'), true);
  assert.equal(matchesProductSearch(product, 'alimentos'), true);
});

test('requires every search term to match and accepts an empty query', () => {
  assert.equal(matchesProductSearch(product, 'leite alimentos'), true);
  assert.equal(matchesProductSearch(product, 'leite higiene'), false);
  assert.equal(matchesProductSearch(product, '   '), true);
});
