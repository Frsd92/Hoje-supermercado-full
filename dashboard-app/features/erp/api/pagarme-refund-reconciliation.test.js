import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePendingPagarmeRefunds } from './pagarme-refund-reconciliation.js';

function createDatabase({
  refundedCents = 6800,
  providerOrderId = 'or_provider-1',
  chargeId = 'ch_provider-1',
  total = 'R$ 68,00',
  requestAmount = '68.00',
  currentRefundedAmount = '0.00',
} = {}) {
  const updates = { order: [], requests: [], events: [] };
  const requests = [{
    id: 'refund-1',
    amount: requestAmount,
    status: 'gateway_processing',
    createdAt: new Date('2026-10-10T12:00:00.000Z'),
  }];
  const order = {
    id: 'PED-test',
    total,
    refundedAmount: currentRefundedAmount,
    pagarmeOrderId: providerOrderId,
    pagarmeChargeId: chargeId,
    paymentStatus: 'paid',
  };
  const transaction = {
    order: {
      findUnique: async () => order,
      update: async ({ data }) => {
        updates.order.push(data);
        Object.assign(order, data);
        return order;
      },
    },
    orderRefundRequest: {
      findMany: async () => requests,
      updateMany: async ({ where, data }) => {
        const request = requests.find((entry) => entry.id === where.id && entry.status === where.status);
        if (!request) return { count: 0 };
        Object.assign(request, data);
        updates.requests.push({ id: where.id, ...data });
        return { count: 1 };
      },
    },
    orderRefundEvent: {
      create: async ({ data }) => {
        updates.events.push(data);
        return data;
      },
    },
  };
  const database = {
    orderRefundRequest: {
      findMany: async () => [{ orderId: 'PED-test' }],
    },
    order: {
      findUnique: async () => order,
    },
    $transaction: async (callback) => callback(transaction),
  };
  const fetchGatewayOrder = async (id) => ({
    id,
    charges: [{ id: chargeId, canceled_amount: refundedCents }],
  });

  return { database, fetchGatewayOrder, updates, requests };
}

test('reconciles a completed full gateway refund and records its confirmed event', async () => {
  const fixture = createDatabase();
  const result = await reconcilePendingPagarmeRefunds(fixture);

  assert.deepEqual(result, { checked: 1, updated: 1, failed: 0, hasMore: false });
  assert.deepEqual(fixture.updates.order, [{ refundedAmount: '68.00', paymentStatus: 'refunded' }]);
  assert.deepEqual(fixture.updates.requests, [{ id: 'refund-1', status: 'completed' }]);
  assert.equal(fixture.updates.events[0].action, 'completed');
  assert.match(fixture.updates.events[0].note, /confirmado/);
});

test('does not complete a refund while the gateway reports no canceled amount', async () => {
  const fixture = createDatabase({ refundedCents: 0 });
  const result = await reconcilePendingPagarmeRefunds(fixture);

  assert.deepEqual(result, { checked: 1, updated: 0, failed: 0, hasMore: false });
  assert.equal(fixture.updates.order.length, 0);
  assert.equal(fixture.updates.requests.length, 0);
});

test('records a confirmed partial refund without marking the order fully refunded', async () => {
  const fixture = createDatabase({
    refundedCents: 3550,
    total: 'R$ 100,00',
    requestAmount: '35.50',
  });
  const result = await reconcilePendingPagarmeRefunds(fixture);

  assert.deepEqual(result, { checked: 1, updated: 1, failed: 0, hasMore: false });
  assert.deepEqual(fixture.updates.order, [{ refundedAmount: '35.50', paymentStatus: 'partially_refunded' }]);
  assert.deepEqual(fixture.updates.requests, [{ id: 'refund-1', status: 'completed' }]);
});

test('does not reconcile a charge that does not belong to the stored provider order', async () => {
  const fixture = createDatabase();
  fixture.fetchGatewayOrder = async (id) => ({
    id,
    charges: [{ id: 'ch-unrelated', canceled_amount: 6800 }],
  });
  const result = await reconcilePendingPagarmeRefunds(fixture);

  assert.equal(result.failed, 1);
  assert.equal(fixture.updates.order.length, 0);
  assert.equal(fixture.updates.requests.length, 0);
});

test('ignores canceled amounts from charges that do not belong to the stored order', async () => {
  const fixture = createDatabase();
  fixture.fetchGatewayOrder = async (id) => ({
    id,
    charges: [
      { id: 'ch_provider-1', canceled_amount: 0 },
      { id: 'ch-unrelated', canceled_amount: 6800 },
    ],
  });
  const result = await reconcilePendingPagarmeRefunds(fixture);

  assert.deepEqual(result, { checked: 1, updated: 0, failed: 0, hasMore: false });
  assert.equal(fixture.updates.order.length, 0);
  assert.equal(fixture.updates.requests.length, 0);
});
