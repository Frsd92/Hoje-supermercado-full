import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeOrder } from './order-serialization.js';

test('serializes fractional product quantities without exposing private cost fields', () => {
  const serialized = serializeOrder({
    id: 'PED-test',
    total: 'R$ 12,50',
    createdAt: new Date('2026-10-03T12:00:00.000Z'),
    updatedAt: new Date('2026-10-03T12:00:00.000Z'),
    items: [{
      id: 'item-1',
      name: 'Produto por peso',
      price: 'R$ 25,00',
      quantity: 0.5,
      unit: 'kg',
      productCode: '1234567890123',
      unitCost: 10,
      promotionDiscount: 2,
    }],
  });

  assert.equal(serialized.total, 'R$ 12,50');
  assert.equal(serialized.createdAtIso, '2026-10-03T12:00:00.000Z');
  assert.equal(serialized.items[0].quantity, 0.5);
  assert.equal(serialized.items[0].unit, 'kg');
  assert.equal(serialized.items[0].saleUnit, 'Quilograma');
  assert.equal(serialized.items[0].productCode, '1234567890123');
  assert.equal(serialized.items[0].promotionDiscount, 2);
  assert.equal('unitCost' in serialized.items[0], false);
});

test('serializes refund requests and their audit events', () => {
  const serialized = serializeOrder({
    id: 'PED-test',
    items: [],
    refundRequests: [{
      id: 'refund-1',
      code: 'EST-refund-1',
      amount: { toNumber: () => 3.5 },
      status: 'requested',
      createdAt: new Date('2026-10-05T12:00:00.000Z'),
      events: [{
        id: 'event-1',
        action: 'requested',
        actor: 'cliente@example.com',
        createdAt: new Date('2026-10-05T12:00:00.000Z'),
      }],
    }],
  });

  assert.equal(serialized.refundRequests[0].amount, 3.5);
  assert.equal(serialized.refundRequests[0].createdAtIso, '2026-10-05T12:00:00.000Z');
  assert.equal(serialized.refundRequests[0].events[0].createdAtIso, '2026-10-05T12:00:00.000Z');
});

test('formats a non-string total for API responses', () => {
  const serialized = serializeOrder({ id: 'PED-test', total: 12.5, items: [] });

  assert.equal(serialized.total, 'R$ 12,50');
  assert.deepEqual(serialized.items, []);
});
