import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SHOPPING_LIST_NAME_LENGTH,
  normalizeShoppingListItems,
  normalizeShoppingListName,
} from './shopping-list-validation.js';

test('normalizes shopping list names and enforces the name limit', () => {
  assert.equal(normalizeShoppingListName('  Compra   do mês  '), 'Compra do mês');
  assert.equal(normalizeShoppingListName('   '), null);
  assert.equal(normalizeShoppingListName('a'.repeat(MAX_SHOPPING_LIST_NAME_LENGTH + 1)), null);
});

test('normalizes valid item quantities and sale units', () => {
  assert.deepEqual(normalizeShoppingListItems([
    { productId: 'item-1', quantity: 2, saleUnit: 'Unidade', ignored: true },
    { productId: 'item-2', quantity: 0.35, saleUnit: 'Quilograma' },
  ]), [
    { productId: 'item-1', quantity: 2, saleUnit: 'Unidade' },
    { productId: 'item-2', quantity: 0.4, saleUnit: 'Quilograma' },
  ]);
});

test('rejects invalid quantities, duplicate IDs, and oversized item sets', () => {
  assert.equal(normalizeShoppingListItems([{ productId: 'item', quantity: 0, saleUnit: 'Unidade' }]), null);
  assert.equal(normalizeShoppingListItems([{ productId: 'item', quantity: 1.5, saleUnit: 'Unidade' }]), null);
  assert.equal(normalizeShoppingListItems([
    { productId: 'item', quantity: 1, saleUnit: 'Unidade' },
    { productId: 'item', quantity: 2, saleUnit: 'Unidade' },
  ]), null);
  assert.equal(normalizeShoppingListItems(Array.from({ length: 101 }, (_, index) => ({
    productId: `item-${index}`,
    quantity: 1,
    saleUnit: 'Unidade',
  }))), null);
});
