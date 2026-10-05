import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesProductSearch, searchProductsByPriority } from './product-search.js';

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

test('prioritizes product names that start with the query before partial and identifier matches', () => {
  const products = [
    { id: 'partial', title: 'Biscoito Moleque' },
    { id: 'sku', title: 'Iogurte natural', sku: 'LEI-123' },
    { id: 'word-prefix', title: 'Brownie Leite' },
    { id: 'title-prefix', title: 'Leite integral' },
  ];

  const result = searchProductsByPriority(products, 'le');

  assert.deepEqual(result.items.map((item) => item.id), ['title-prefix', 'word-prefix', 'sku', 'partial']);
  assert.equal(result.totalMatches, 4);
});

test('returns product suggestions after the first typed character', () => {
  const products = [
    { id: 'rice', title: 'Arroz branco' },
    { id: 'milk', title: 'Leite integral' },
    { id: 'yogurt', title: 'Iogurte natural' },
  ];

  const result = searchProductsByPriority(products, 'l');

  assert.equal(result.items[0].id, 'milk');
  assert.equal(result.totalMatches, 2);
});

test('prioritizes identifiers that start with numeric searches and limits displayed results', () => {
  const products = [
    { id: 'name-prefix', title: '789 Biscoito', barcode: '000001' },
    { id: 'barcode-prefix', title: 'Leite integral', barcode: '78912345678' },
    ...Array.from({ length: 35 }, (_, index) => ({ id: `extra-${index}`, title: `789 Produto ${index}` })),
  ];

  const result = searchProductsByPriority(products, '789');

  assert.equal(result.items[0].id, 'barcode-prefix');
  assert.equal(result.items[1].id, 'name-prefix');
  assert.equal(result.totalMatches, 37);
  assert.equal(result.items.length, 30);
});
