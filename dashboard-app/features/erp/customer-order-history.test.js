import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerOrderHistory } from './customer-order-history.js';

test('creates a chronological, printable customer order history with net refund totals', () => {
  const history = getCustomerOrderHistory([{
    id: 'PED-2',
    customerName: 'Cliente',
    customerEmail: 'cliente@example.com',
    total: 'R$ 120,00',
    refundedAmount: '30.00',
    status: 'Concluido',
    paymentStatus: 'partially_refunded',
    paymentMethod: 'pix',
    createdAt: new Date('2026-10-02T10:00:00Z'),
    updatedAt: new Date('2026-10-03T10:00:00Z'),
    items: [{ id: 'item-1', name: 'Produto', productCode: 'P1', price: 'R$ 60,00', quantity: '2', unit: 'unidade' }],
    serviceRequests: [],
    paymentEvents: [{ id: 'pay-1', eventType: 'charge.refunded', receivedAt: new Date('2026-10-03T10:00:00Z') }],
    refundRequests: [{
      id: 'refund-1',
      code: 'EST-1',
      amount: '30.00',
      status: 'completed',
      reason: 'Produto indisponível',
      requestedBy: 'Operação',
      createdAt: new Date('2026-10-02T12:00:00Z'),
      reviewedBy: 'Financeiro',
      reviewedAt: new Date('2026-10-02T13:00:00Z'),
      decisionNote: 'Confirmado',
      events: [
        { id: 'refund-event-1', action: 'requested', actor: 'Operação', note: 'Solicitado', createdAt: new Date('2026-10-02T12:00:00Z') },
        { id: 'refund-event-2', action: 'completed', actor: 'Pagar.me', note: 'Devolução confirmada', createdAt: new Date('2026-10-03T10:00:00Z') },
      ],
    }],
  }]);

  assert.equal(history.length, 1);
  assert.equal(history[0].total, 120);
  assert.equal(history[0].refundedAmount, 30);
  assert.equal(history[0].netAmount, 90);
  assert.equal(history[0].items[0].total, 120);
  assert.equal(history[0].events[0].label, 'Pedido realizado');
  assert.ok(history[0].events.some((event) => event.label === 'Atualização de pagamento: charge.refunded'));
  assert.equal(history[0].events.at(-1).label, 'Estorno confirmado pela gateway');
  assert.equal(history[0].refunds[0].statusLabel, 'Estorno confirmado pela gateway');
});

test('flags cancellations that lack an explicit cancellation audit event', () => {
  const [order] = getCustomerOrderHistory([{
    id: 'PED-1',
    total: 'R$ 50,00',
    refundedAmount: 0,
    status: 'Cancelado',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    updatedAt: new Date('2026-10-02T10:00:00Z'),
    updatedBy: 'ERP Operador',
  }]);

  assert.equal(order.statusDateIsApproximate, true);
  assert.match(order.events.at(-1).note, /não há evento de cancelamento registrado/);
});

test('does not count requested refunds as confirmed returned value', () => {
  const [order] = getCustomerOrderHistory([{
    id: 'PED-3',
    total: 100,
    refundedAmount: 0,
    status: 'Concluido',
    createdAt: new Date('2026-10-04T10:00:00Z'),
    refundRequests: [{
      id: 'refund-2',
      code: 'EST-2',
      amount: 25,
      status: 'requested',
      reason: 'Produto divergente',
      requestedBy: 'Cliente',
      createdAt: new Date('2026-10-04T11:00:00Z'),
      events: [],
    }],
  }]);

  assert.equal(order.refundedAmount, 0);
  assert.equal(order.netAmount, 100);
  assert.equal(order.refunds[0].amount, 25);
});

test('preserves recorded refunds above the order total for audit visibility', () => {
  const [order] = getCustomerOrderHistory([{
    id: 'PED-4',
    total: 100,
    refundedAmount: 110,
    status: 'Concluido',
  }]);

  assert.equal(order.refundedAmount, 110);
  assert.equal(order.netAmount, -10);
});
