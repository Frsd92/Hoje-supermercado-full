import test from 'node:test';
import assert from 'node:assert/strict';
import { appendPriceHistory } from './price-history.js';

const current = {
  price: 10,
  cost: 6,
  discount: 0,
  priceHistory: [{ date: '2026-09-29T12:00:00.000Z', price: 10, cost: 6, discount: 0, changedBy: 'ana' }],
};

test('appends a dated record with actor when price changes', () => {
  const history = appendPriceHistory(current, { price: 12, cost: 6, discount: 0 }, 'bruno', new Date('2026-09-30T12:00:00.000Z'));
  assert.equal(history.length, 2);
  assert.deepEqual(history[1], {
    date: '2026-09-30T12:00:00.000Z',
    price: 12,
    cost: 6,
    discount: 0,
    changedBy: 'bruno',
  });
});

test('records cost and discount changes even when the list price stays the same', () => {
  const history = appendPriceHistory(current, { price: 10, cost: 7, discount: 15 }, 'bruno');
  assert.equal(history.length, 2);
  assert.equal(history[1].price, 10);
  assert.equal(history[1].cost, 7);
  assert.equal(history[1].discount, 15);
});

test('does not create a false history record when price fields are unchanged', () => {
  assert.equal(appendPriceHistory(current, { price: 10, cost: 6, discount: 0 }, 'bruno'), current.priceHistory);
});

test('does not invent a historical baseline for a product without recorded history', () => {
  const history = appendPriceHistory({ ...current, priceHistory: [] }, { price: 12, cost: 6, discount: 0 }, 'bruno', new Date('2026-09-30T12:00:00.000Z'));
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], {
    date: '2026-09-30T12:00:00.000Z',
    price: 12,
    cost: 6,
    discount: 0,
    changedBy: 'bruno',
  });
});
