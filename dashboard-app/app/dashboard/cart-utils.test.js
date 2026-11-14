import test from 'node:test';
import assert from 'node:assert/strict';

import { adjustCartQuantity, formatCartQuantity, getCartItemCount, isSameCartProduct, normalizeCartItems, removeCartProduct, updateCartPrices } from './cart-utils.js';

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

test('updates existing cart prices from the current sale price without changing quantities', () => {
  const cart = [{ productId: 'p1', name: 'Café', price: 'R$ 12,00', quantity: 2 }];
  const updatedCart = updateCartPrices(cart, [{ id: 'p1', price: 15, salePrice: 10 }]);

  assert.equal(updatedCart[0].price.replace(/\u00a0/g, ' '), 'R$ 10,00');
  assert.equal(updatedCart[0].quantity, 2);
});

test('preserves the cart reference when prices are unchanged or unavailable', () => {
  const cart = [{ productId: 'p1', name: 'Café', price: 'R$ 12,00', quantity: 2 }];

  assert.equal(updateCartPrices(cart, [{ id: 'p1', price: 12, salePrice: 12 }]), cart);
  assert.equal(updateCartPrices(cart, [{ id: 'p1', price: 0 }]), cart);
});

test('removes the matching product by stable ID even if its catalog title changed', () => {
  const cart = [
    { productId: 'product-1', name: 'Nome antigo', quantity: 2 },
    { productId: 'product-2', name: 'Outro produto', quantity: 1 },
  ];
  assert.deepEqual(removeCartProduct(cart, { id: 'product-1', name: 'Nome atualizado' }), [cart[1]]);
});

test('matches legacy cart products by accent-insensitive name when no ID is available', () => {
  assert.equal(isSameCartProduct({ name: 'Cafe' }, { name: 'Café' }), true);
  assert.deepEqual(
    removeCartProduct([{ name: 'Cafe' }, { name: 'Chá' }], { name: 'Café' }),
    [{ name: 'Chá' }],
  );
});
