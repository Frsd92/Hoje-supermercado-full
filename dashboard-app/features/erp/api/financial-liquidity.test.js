import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSupplierPayablesSummary } from './financial-liquidity.js';

test('summarizes launched supplier payables by overdue, upcoming and paid states', () => {
  const summary = buildSupplierPayablesSummary([
    { amount: '100.25', status: 'Em aberto', dueAt: '2026-10-13', invoiceStatus: 'Lançada' },
    { amount: '200', status: 'Em disputa', dueAt: '2026-10-20', invoiceStatus: 'Lançada' },
    { amount: '300', status: 'Em aberto', dueAt: '2026-12-01', invoiceStatus: 'Lançada' },
    { amount: '50', status: 'Em aberto', dueAt: null, invoiceStatus: 'Lançada' },
    { amount: '75', status: 'Paga', paidAt: '2026-10-10T15:00:00.000Z', invoiceStatus: 'Lançada' },
    { amount: '999', status: 'Em aberto', dueAt: '2026-10-12', invoiceStatus: 'Em Análise' },
  ], new Date('2026-10-14T15:00:00.000Z'));

  assert.equal(summary.outstanding, 650.25);
  assert.equal(summary.overdue, 100.25);
  assert.equal(summary.dueNext30Days, 200);
  assert.equal(summary.dueLaterOrUnscheduled, 350);
  assert.equal(summary.paidThisMonth, 75);
  assert.equal(summary.openCount, 4);
  assert.equal(summary.paidCountThisMonth, 1);
  assert.equal(summary.paidTrend.length, 6);
  assert.equal(summary.paidTrend.at(-1).paid, 75);
});

test('does not count invalid values or unpaid items as cash paid', () => {
  const summary = buildSupplierPayablesSummary([
    { amount: 'invalid', status: 'Paga', paidAt: '2026-10-10', invoiceStatus: 'Lançada' },
    { amount: 20, status: 'Em aberto', dueAt: 'invalid', invoiceStatus: 'Lançada' },
  ], new Date('2026-10-14T15:00:00.000Z'));

  assert.equal(summary.paidThisMonth, 0);
  assert.equal(summary.outstanding, 20);
  assert.equal(summary.dueLaterOrUnscheduled, 20);
});

test('keeps database date-only due dates in their stored calendar day', () => {
  const summary = buildSupplierPayablesSummary([
    { amount: 40, status: 'Em aberto', dueAt: new Date('2026-10-14T00:00:00.000Z'), invoiceStatus: 'Lançada' },
  ], new Date('2026-10-14T15:00:00.000Z'));

  assert.equal(summary.overdue, 0);
  assert.equal(summary.dueNext30Days, 40);
});
