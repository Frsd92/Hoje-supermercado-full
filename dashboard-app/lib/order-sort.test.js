import test from 'node:test';
import assert from 'node:assert/strict';

import { getDaysSincePurchase, parseOrderDate, sortOrdersNewestFirst } from './order-sort.js';

test('parses Brazilian order dates with their time component', () => {
  const parsed = parseOrderDate('30/09/2026, 19:27:45');

  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 8);
  assert.equal(parsed.getDate(), 30);
  assert.equal(parsed.getHours(), 19);
  assert.equal(parsed.getMinutes(), 27);
  assert.equal(parsed.getSeconds(), 45);
});

test('rejects invalid Brazilian dates rather than normalizing them', () => {
  assert.equal(parseOrderDate('31/02/2026, 19:27:45'), null);
});

test('calculates elapsed purchase days from Brazilian date and time', () => {
  const now = new Date(2026, 8, 30, 20, 0, 0);

  assert.equal(getDaysSincePurchase('30/09/2026, 19:00:00', now), 0);
  assert.equal(getDaysSincePurchase('29/09/2026, 20:00:00', now), 1);
  assert.equal(getDaysSincePurchase('invalid date', now), null);
});

test('counts only full 24-hour periods since the purchase', () => {
  const now = new Date(2026, 9, 1, 1, 14, 0);

  assert.equal(getDaysSincePurchase('30/09/2026, 23:45:00', now), 0);
  assert.equal(getDaysSincePurchase('30/09/2026, 01:14:00', now), 1);
  assert.equal(getDaysSincePurchase('30/09/2026, 01:15:00', now), 0);
  assert.equal(getDaysSincePurchase('02/10/2026, 12:00:00', now), 0);
});

test('sorts orders by their parsed purchase time instead of insertion order', () => {
  const orders = [
    { id: 'PED-1780000000000', createdAt: '20/09/2026, 10:00:00' },
    { id: 'PED-1770000000000', createdAt: '30/09/2026, 19:27:45' },
  ];

  assert.deepEqual(sortOrdersNewestFirst(orders), [orders[1], orders[0]]);
});
