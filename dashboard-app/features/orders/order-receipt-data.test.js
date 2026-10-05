import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOrderReceiptData,
  calculateOrderTotals,
  parseReceiptAmount,
} from './order-receipt-data.js';

test('parses Brazilian and plain decimal currency values', () => {
  assert.equal(parseReceiptAmount('R$ 1.234,56'), 1234.56);
  assert.equal(parseReceiptAmount('R$ 19.90 / kg'), 19.9);
  assert.equal(parseReceiptAmount(Number.NaN), 0);
});

test('rounds each order line before calculating coupon and payable totals', () => {
  const totals = calculateOrderTotals([
    { name: 'Produto A', price: 'R$ 1,99', quantity: 1 },
    { name: 'Produto por peso', price: 'R$ 1,99', quantity: 0.1, unit: 'kg' },
  ], 10);

  assert.deepEqual(totals.lines.map((line) => line.lineTotal), [1.99, 0.2]);
  assert.equal(totals.subtotal, 2.19);
  assert.equal(totals.couponDiscountAmount, 0.22);
  assert.equal(totals.total, 1.97);
});

test('builds a traceable receipt from persisted order totals and coupon data', () => {
  const receipt = buildOrderReceiptData({
    id: 'PED-trace-001',
    createdAtIso: '2026-10-05T12:30:00.000Z',
    status: 'Recebido',
    paymentMethod: 'pix',
    includeCpfOnReceipt: true,
    subtotal: '10.00',
    total: 'R$ 8,50',
    couponCode: 'cliente15',
    couponDiscountPercent: 15,
    couponDiscountAmount: '1.50',
    items: [{ name: 'Arroz', price: 'R$ 10,00', quantity: 1 }],
  });

  assert.equal(receipt.orderId, 'PED-trace-001');
  assert.equal(receipt.createdAt, '2026-10-05T12:30:00.000Z');
  assert.equal(receipt.couponCode, 'CLIENTE15');
  assert.equal(receipt.includeCpfOnReceipt, true);
  assert.equal(receipt.subtotal, 10);
  assert.equal(receipt.couponDiscountAmount, 1.5);
  assert.equal(receipt.total, 8.5);
  assert.equal(receipt.totalAdjustment, 0);
});

test('uses order items for legacy subtotal and does not invent coupon discounts', () => {
  const receipt = buildOrderReceiptData({
    id: 'PED-legacy',
    total: 'R$ 4,00',
    items: [{ name: 'Feijão', price: 'R$ 4,00', quantity: 1 }],
  });

  assert.equal(receipt.subtotal, 4);
  assert.equal(receipt.couponDiscountAmount, 0);
  assert.equal(receipt.total, 4);
});
