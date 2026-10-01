import test from 'node:test';
import assert from 'node:assert/strict';

import { adjustCartQuantity, formatCartQuantity, getCartItemCount, normalizeCartItems } from './cart-utils.js';

test('formats kilogram cart quantities in 100-gram steps', () => {
  assert.equal(formatCartQuantity({ quantity: 0.1, saleUnit: 'Quilograma' }), '100 g');
  assert.equal(formatCartQuantity({ quantity: 0.2, saleUnit: 'Quilograma' }), '200 g');
  assert.equal(formatCartQuantity({ quantity: 1.1, saleUnit: 'Quilograma' }), '1,1 kg');
});

test('counts a weighted product as one cart item, not a fraction of an item', () => {
  assert.equal(getCartItemCount([
    { quantity: 0.2, saleUnit: 'Quilograma' },
    { quantity: 3, saleUnit: 'Unidade' },
  ]), 4);
});

test('keeps a cart item at its minimum until the explicit remove action is used', () => {
  assert.equal(adjustCartQuantity(0.1, -1, 'Quilograma'), 0.1);
  assert.equal(adjustCartQuantity(1, -1, 'Unidade'), 1);
  assert.equal(adjustCartQuantity(0.2, -1, 'Quilograma'), 0.1);
});

test('normalizes duplicate product cards into one cart item without increasing its quantity', () => {
  const cart = normalizeCartItems([
    { productId: 'p1', name: 'Maçã Gala', quantity: 2 },
    { productId: 'p1', name: 'Maçã Gala', quantity: 2 },
    { productId: 'p2', name: 'Banana', quantity: 1 },
  ]);
  assert.equal(cart.length, 2);
  assert.equal(cart.find((item) => item.name === 'Maçã Gala').quantity, 2);
});

test('normalizes legacy duplicates by accent-insensitive product name', () => {
  const cart = normalizeCartItems([
    { name: 'Cafe', quantity: 1 },
    { name: 'Café', quantity: 1 },
  ]);
  assert.equal(cart.length, 1);
});
