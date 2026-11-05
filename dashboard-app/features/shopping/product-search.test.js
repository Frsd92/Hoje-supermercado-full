import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShoppingSearch, searchShoppingProducts } from './product-search.js';

const products = [
  { id: 'coca', title: 'Refrigerante Coca-Cola Lata 350ml', categories: ['Bebidas'] },
  { id: 'cream', title: 'Creme de leite', categories: ['Laticínios'] },
  { id: 'rice', title: 'Arroz branco', categories: ['Mercearia'] },
];

test('search returns products as soon as the first letter is typed', () => {
  assert.deepEqual(searchShoppingProducts(products, 'c').map((product) => product.id), ['coca', 'cream', 'rice']);
});

test('search ignores accents and matches product categories', () => {
  assert.equal(normalizeShoppingSearch('Laticínios'), 'laticinios');
  assert.deepEqual(searchShoppingProducts(products, 'laticinios').map((product) => product.id), ['cream']);
});

test('empty search has no suggestions and result count is capped', () => {
  assert.deepEqual(searchShoppingProducts(products, '  '), []);
  assert.equal(searchShoppingProducts(products, 'a', 1).length, 1);
});
