import test from 'node:test';
import assert from 'node:assert/strict';
import { getErpActionCounts, getPendingCustomerActionCount } from './action-notifications.js';

test('counts unresolved customer cancellation, exchange, and refund actions', () => {
  const orders = [{
    status: 'Separacao',
    serviceRequests: [
      { status: 'requested' },
      { status: 'approved' },
      { status: 'rejected' },
    ],
    refundRequests: [
      { status: 'requested' },
      { status: 'approved_waiting_gateway' },
      { status: 'gateway_failed' },
      { status: 'gateway_processing' },
      { status: 'completed' },
      { status: 'rejected' },
    ],
  }];

  assert.equal(getPendingCustomerActionCount(orders), 4);
});

test('shows customer actions in both navigation items and respects acknowledged new orders', () => {
  const orders = [
    { id: 'order-1', status: 'Recebido', serviceRequests: [], refundRequests: [] },
    { id: 'order-2', status: 'Recebido', serviceRequests: [{ status: 'requested' }], refundRequests: [] },
    { id: 'order-3', status: 'Separacao', serviceRequests: [], refundRequests: [{ status: 'requested' }] },
  ];

  assert.deepEqual(getErpActionCounts(orders, ['order-1']), { customers: 2, orders: 3 });
  assert.deepEqual(getErpActionCounts(orders, ['order-1', 'order-2']), { customers: 2, orders: 2 });
});

test('does not show badges after customer requests are resolved', () => {
  const orders = [{
    id: 'order-1',
    status: 'Separacao',
    serviceRequests: [{ status: 'approved' }, { status: 'rejected' }],
    refundRequests: [{ status: 'completed' }, { status: 'rejected' }, { status: 'gateway_processing' }],
  }];

  assert.deepEqual(getErpActionCounts(orders), { customers: 0, orders: 0 });
});
