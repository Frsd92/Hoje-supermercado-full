import assert from 'node:assert/strict';
import test from 'node:test';
import { productCategoryGroups, productMainCategories } from './product-categories.js';

test('provides the renamed drink category and requested main categories', () => {
  assert.ok(productMainCategories.includes('Sucos e Refrigerantes'));
  assert.ok(productMainCategories.includes('Água'));
  assert.ok(productMainCategories.includes('Churrasco'));
  assert.ok(productMainCategories.includes('Coca-Cola'));
  assert.ok(!productMainCategories.includes('Bebidas'));
  assert.deepEqual(productCategoryGroups.find(({ id }) => id === 'brands').categories, [
    'Triex',
    'Nestlé',
    'Bauducco',
    'Fini',
    'Sanjer',
    'Sadia',
    'Marba',
    'Lacta',
    'Heineken',
    'Stella',
    'Casillero del Diablo',
    'Casa Valduga',
    'Coca-Cola',
  ]);
  assert.ok(productCategoryGroups.find(({ id }) => id === 'departments').categories.includes('Churrasco'));
});
