import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSalesCashFlowEntries } from './sales-cash-flow.js';

test('excludes orders without confirmed payment and includes paid sales', () => {
  const entries = buildSalesCashFlowEntries([
    { id: 'unpaid-cancelled', total: 0.68, paymentStatus: 'canceled', createdAt: '2026-10-10' },
    { id: 'pending', total: 10, paymentStatus: 'pending', createdAt: '2026-10-10' },
    { id: 'paid', total: 12, paymentStatus: 'paid', createdAt: '2026-10-10' },
  ]);

  assert.deepEqual(entries.map(({ id, type, amount }) => ({ id, type, amount })), [
    { id: 'sale-paid', type: 'Entrada', amount: 12 },
  ]);
});

test('records partial and full confirmed refunds as separate cash outflows', () => {
  const entries = buildSalesCashFlowEntries([
    {
      id: 'partial',
      total: 10,
      refundedAmount: 3,
      paymentStatus: 'partially_refunded',
      createdAt: '2026-10-10',
      refunds: [{ id: 'refund-1', amount: 3, date: '2026-10-12' }],
    },
    {
      id: 'full',
      total: 8,
      refundedAmount: 8,
      paymentStatus: 'refunded',
      createdAt: '2026-10-10',
      refundDate: '2026-10-13',
    },
  ]);

  assert.deepEqual(entries.map(({ id, date, direction, amount, status }) => ({
    id,
    date,
    direction,
    amount,
    status,
  })), [
    { id: 'sale-partial', date: '2026-10-10', direction: 'entry', amount: 10, status: 'Estorno parcial' },
    { id: 'refund-partial-refund-1', date: '2026-10-12', direction: 'exit', amount: 3, status: 'Estornado' },
    { id: 'sale-full', date: '2026-10-10', direction: 'entry', amount: 8, status: 'Estornado' },
    { id: 'refund-full-confirmed', date: '2026-10-13', direction: 'exit', amount: 8, status: 'Estornado' },
  ]);
});

test('caps refund details to the confirmed aggregate amount and records any remainder once', () => {
  const entries = buildSalesCashFlowEntries([{
    id: 'order',
    total: 'R$ 10,00',
    refundedAmount: '0,75',
    paymentStatus: 'partially_refunded',
    createdAt: '2026-10-10',
    refundDate: '2026-10-13',
    refunds: [
      { id: 'first', amount: '0,50', date: '2026-10-11' },
      { id: 'stale', amount: '0,50', date: '2026-10-12' },
    ],
  }]);

  assert.deepEqual(entries.filter(({ direction }) => direction === 'exit').map(({ amount, date }) => ({ amount, date })), [
    { amount: 0.5, date: '2026-10-11' },
    { amount: 0.25, date: '2026-10-12' },
  ]);
});
