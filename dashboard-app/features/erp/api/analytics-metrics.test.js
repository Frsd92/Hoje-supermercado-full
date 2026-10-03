import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProfitability } from './analytics-metrics.js';

test('keeps gross profit and margin unavailable when any sold item lacks a cost snapshot', () => {
  const result = summarizeProfitability({
    orders: [{ totalAmount: 100, items: [{}, {}] }],
    lineItems: [
      { costKnown: true, cost: 20 },
      { costKnown: false, cost: null },
    ],
    revenue: 100,
  });

  assert.equal(result.available, false);
  assert.equal(result.grossProfit, null);
  assert.equal(result.margin, null);
  assert.equal(result.cmv, null);
  assert.equal(result.missingCostItems, 1);
  assert.equal(result.knownCostItems, 1);
});

test('calculates gross profit and margin from complete unit cost snapshots', () => {
  const result = summarizeProfitability({
    orders: [{ totalAmount: 100, items: [{}, {}] }],
    lineItems: [
      { costKnown: true, cost: 20 },
      { costKnown: true, cost: 20 },
    ],
    revenue: 100,
  });

  assert.equal(result.available, true);
  assert.equal(result.grossProfit, 60);
  assert.equal(result.margin, 60);
  assert.equal(result.cmv, 40);
  assert.equal(result.missingCostItems, 0);
});

test('does not treat an order without line items as zero-cost profit', () => {
  const result = summarizeProfitability({
    orders: [{ totalAmount: 25, items: [] }],
    lineItems: [],
    revenue: 25,
  });

  assert.equal(result.available, false);
  assert.equal(result.grossProfit, null);
  assert.equal(result.missingCostItems, 1);
});
