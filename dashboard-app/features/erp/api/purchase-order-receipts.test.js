import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePurchaseOrderReceiptItems } from './purchase-order-receipts.js';

test('parses a partial receipt split into lots with separate quantities and dates', () => {
  const result = parsePurchaseOrderReceiptItems([{
    itemId: 'line-1',
    unitCost: '4,25',
    lots: [
      { quantity: '10', lotCode: 'A', expiry: '2026-10-10' },
      { quantity: '10', lotCode: 'B', expiry: '2026-10-20' },
      { quantity: '10', lotCode: 'C', expiry: '2026-11-24' },
    ],
  }]);

  assert.equal(result.error, undefined);
  assert.equal(result.receipts.get('line-1').quantityMilliUnits, 30_000);
  assert.equal(result.receipts.get('line-1').unitCost, 4.25);
  assert.deepEqual(result.receipts.get('line-1').lots.map((lot) => [lot.lotCode, lot.quantity, lot.expiry]), [
    ['A', 10, '2026-10-10'],
    ['B', 10, '2026-10-20'],
    ['C', 10, '2026-11-24'],
  ]);
});

test('rejects missing quantities, invalid dates, duplicate lines, and an empty receipt', () => {
  assert.match(parsePurchaseOrderReceiptItems([{
    itemId: 'line-1',
    unitCost: 1,
    lots: [{ quantity: '', expiry: '2026-10-10' }],
  }]).error, /quantidade/);
  assert.match(parsePurchaseOrderReceiptItems([{
    itemId: 'line-1',
    unitCost: 1,
    lots: [{ quantity: 1, expiry: '2026-02-30' }],
  }]).error, /datas válidas/);
  assert.match(parsePurchaseOrderReceiptItems([
    { itemId: 'line-1', unitCost: 1, lots: [{ quantity: 1 }] },
    { itemId: 'line-1', unitCost: 1, lots: [{ quantity: 1 }] },
  ]).error, /mais de uma vez/);
  assert.match(parsePurchaseOrderReceiptItems([{
    itemId: 'line-1',
    unitCost: 1,
    lots: [{ quantity: 0 }],
  }]).error, /maior que zero/);
});
