import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentMonthSpend } from './budget.js';

const currentMonth = new Date('2026-10-14T12:00:00.000Z');

test('excludes fully refunded amounts from current-month spending', () => {
  assert.equal(getCurrentMonthSpend([{
    createdAt: '2026-10-10T12:00:00.000Z',
    total: 'R$ 0,68',
    refundedAmount: '0.68',
  }], currentMonth), 0);
});

test('subtracts confirmed partial refunds from current-month spending', () => {
  assert.equal(getCurrentMonthSpend([{
    createdAt: '2026-10-10T12:00:00.000Z',
    total: 'R$ 10,00',
    refundedAmount: '3.25',
  }], currentMonth), 6.75);
});

test('does not let an invalid over-refund make monthly spending negative', () => {
  assert.equal(getCurrentMonthSpend([{
    createdAt: '2026-10-10T12:00:00.000Z',
    total: 'R$ 0,68',
    refundedAmount: '1.00',
  }], currentMonth), 0);
});
