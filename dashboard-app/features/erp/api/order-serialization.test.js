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

test('serializes customer service requests with review timestamps', () => {
  const serialized = serializeOrder({
    id: 'PED-test',
    items: [],
    serviceRequests: [{
      id: 'service-1',
      code: 'SOL-service-1',
      type: 'exchange',
      status: 'requested',
      createdAt: new Date('2026-10-06T12:00:00.000Z'),
      reviewedAt: null,
    }],
  });

  assert.equal(serialized.serviceRequests[0].type, 'exchange');
  assert.equal(serialized.serviceRequests[0].createdAtIso, '2026-10-06T12:00:00.000Z');
  assert.equal(serialized.serviceRequests[0].reviewedAtIso, null);
});

test('formats a non-string total for API responses', () => {
  const serialized = serializeOrder({ id: 'PED-test', total: 12.5, items: [] });

  assert.equal(serialized.total, 'R$ 12,50');
  assert.deepEqual(serialized.items, []);
});

test('keeps Bling integration metadata private unless requested by the ERP serializer', () => {
  const order = {
    id: 'PED-test',
    total: 'R$ 12,50',
    items: [],
    blingSalesOrderId: '998877',
    blingSalesOrderNumber: '123',
    blingSyncedAt: new Date('2026-10-19T12:00:00.000Z'),
    blingSyncStatus: 'failed',
    blingSyncError: 'Erro interno do Bling',
  };

  const publicOrder = serializeOrder(order);
  const erpOrder = serializeOrder(order, { includeBling: true });

  assert.equal('blingSalesOrderId' in publicOrder, false);
  assert.equal('blingSyncError' in publicOrder, false);
  assert.equal(erpOrder.blingSalesOrderId, '998877');
  assert.equal(erpOrder.blingSyncStatus, 'failed');
  assert.equal(erpOrder.blingSyncError, 'Erro interno do Bling');
  assert.equal(erpOrder.blingSyncedAt, '2026-10-19T12:00:00.000Z');
});

test('exposes only an authorized NFC-e to the authenticated customer order response', () => {
  const order = {
    id: 'PED-fiscal',
    items: [],
    blingNfceId: '123',
    blingNfceNumber: '42',
    blingNfceAccessKey: 'access-key',
    blingNfceStatus: 'authorized',
    blingNfceAuthorizedAt: new Date('2026-10-21T12:00:00.000Z'),
    blingNfcePdfUrl: 'https://example.com/nfce.pdf',
    blingNfceError: null,
  };

  const serialized = serializeOrder(order, { includeFiscal: true });

  assert.deepEqual(serialized.fiscalInvoice, {
    number: '42',
    accessKey: 'access-key',
    pdfUrl: 'https://example.com/nfce.pdf',
    authorizedAt: '2026-10-21T12:00:00.000Z',
  });
  assert.equal('blingNfceId' in serialized, false);
  assert.equal('blingNfceError' in serialized, false);
  assert.equal('fiscalInvoice' in serializeOrder({ ...order, blingNfceStatus: 'processing' }, { includeFiscal: true }), false);
});
