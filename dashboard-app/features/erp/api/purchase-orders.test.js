import test from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionPurchaseOrder, isPurchaseOrderLate, purchaseOrderSnapshot, validatePurchaseOrder } from './purchase-orders.js';

test('validates real purchase order items and calculates their actual requested total', () => {
  const result = validatePurchaseOrder({
    supplierId: 'supplier-1',
    expectedDelivery: '2026-10-10',
    items: [
      { productId: 'product-1', quantity: '3', unitPrice: '8.50' },
      { productId: 'product-2', quantity: 0.5, unitPrice: 10 },
    ],
  });
  assert.equal(result.data.total, 30.5);
  assert.equal(result.data.items.length, 2);
  assert.equal(validatePurchaseOrder({
    supplierId: 'supplier-1',
    items: [{ productId: 'product-1', quantity: '0.333', unitPrice: '1.01' }],
  }).data.total, 0.34);
});

test('rejects missing suppliers, empty orders, invalid quantities, and duplicate product lines', () => {
  assert.match(validatePurchaseOrder({ items: [] }).error, /fornecedor ativo/);
  assert.match(validatePurchaseOrder({ supplierId: 's', items: [] }).error, /ao menos um produto/);
  assert.match(validatePurchaseOrder({ supplierId: 's', items: [{ productId: 'p', quantity: 0, unitPrice: 2 }] }).error, /quantidade maior que zero/);
  assert.match(validatePurchaseOrder({ supplierId: 's', items: [{ productId: 'p', quantity: 0.0001, unitPrice: 2 }] }).error, /três casas decimais/);
  assert.match(validatePurchaseOrder({ supplierId: 's', items: [{ productId: 'p', quantity: 1, unitPrice: 2.001 }] }).error, /duas casas decimais/);
  assert.match(validatePurchaseOrder({ supplierId: 's', items: [{ productId: 'p', quantity: 1, unitPrice: 2 }, { productId: 'p', quantity: 1, unitPrice: 2 }] }).error, /mais de uma vez/);
});

test('enforces the purchase order workflow without transitions from terminal states', () => {
  assert.equal(canTransitionPurchaseOrder('Rascunho', 'Aguardando Confirmação'), true);
  assert.equal(canTransitionPurchaseOrder('Aguardando Confirmação', 'Em Trânsito'), false);
  assert.equal(canTransitionPurchaseOrder('Confirmado', 'Em Trânsito'), true);
  assert.equal(canTransitionPurchaseOrder('Confirmado', 'Recebido'), false);
  assert.equal(canTransitionPurchaseOrder('Em Trânsito', 'Recebido'), false);
  assert.equal(canTransitionPurchaseOrder('Recebido', 'Cancelado'), false);
});

test('marks only unreceived, uncancelled due orders as overdue', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  assert.equal(isPurchaseOrderLate({ status: 'Em Trânsito', expectedDelivery: '2026-09-30' }, now), true);
  assert.equal(isPurchaseOrderLate({ status: 'Em Trânsito', expectedDelivery: '2026-10-01' }, now), false);
  assert.equal(isPurchaseOrderLate({ status: 'Recebido', expectedDelivery: '2026-09-30' }, now), false);
  assert.equal(isPurchaseOrderLate({ status: 'Rascunho', expectedDelivery: '2026-09-30' }, now), false);
});

test('converts dates and decimal values into serializable audit snapshots', () => {
  assert.deepEqual(purchaseOrderSnapshot({ createdAt: new Date('2026-10-01T12:00:00Z'), total: { toNumber: () => 42 } }), {
    createdAt: '2026-10-01T12:00:00.000Z',
    total: 42,
  });
});
