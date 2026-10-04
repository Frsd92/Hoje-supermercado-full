import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCartActivityAt, mergeCartItems, normalizeGuestCartId } from './cart-storage.js';

test('validates guest cart IDs before using them as persistent storage keys', () => {
  assert.equal(normalizeGuestCartId('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(normalizeGuestCartId('1780000000000-cartid'), '1780000000000-cartid');
  assert.equal(normalizeGuestCartId('invalid/id'), '');
  assert.equal(normalizeGuestCartId('x'.repeat(81)), '');
});

test('merges guest items into a saved customer cart without losing either cart', () => {
  const merged = mergeCartItems(
    [{ productId: 'p1', name: 'Maçã Gala', quantity: 2, price: 'R$ 5,00' }],
    [
      { productId: 'p1', name: 'Maca Gala', quantity: 1, price: 'R$ 5,50' },
      { productId: 'p2', name: 'Banana', quantity: 3 },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.productId === 'p1').quantity, 3);
  assert.equal(merged.find((item) => item.productId === 'p1').price, 'R$ 5,50');
  assert.equal(merged.find((item) => item.productId === 'p2').quantity, 3);
});

test('merges weighted cart quantities precisely in kilogram increments', () => {
  const merged = mergeCartItems(
    [{ name: 'Maçã Gala', quantity: 0.2, saleUnit: 'Quilograma' }],
    [{ name: 'Maçã Gala', quantity: 0.1, saleUnit: 'Quilograma' }],
  );

  assert.equal(merged[0].quantity, 0.3);
  assert.equal(merged[0].saleUnit, 'Quilograma');
});

test('does not add duplicate products within the same saved cart during normalization', () => {
  const merged = mergeCartItems(
    [
      { productId: 'p1', name: 'Maçã', quantity: 2 },
      { productId: 'p1', name: 'Maçã', quantity: 2 },
    ],
    [{ productId: 'p2', name: 'Banana', quantity: 1 }],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged.find((item) => item.name === 'Maçã').quantity, 2);
});

test('preserves the most recent real activity time when a guest cart is merged into an account', () => {
  const customerActivity = new Date('2026-10-03T10:00:00.000Z');
  const guestActivity = new Date('2026-10-02T10:00:00.000Z');

  assert.equal(latestCartActivityAt(customerActivity, guestActivity).toISOString(), customerActivity.toISOString());
  assert.equal(latestCartActivityAt(guestActivity, customerActivity).toISOString(), customerActivity.toISOString());
});
