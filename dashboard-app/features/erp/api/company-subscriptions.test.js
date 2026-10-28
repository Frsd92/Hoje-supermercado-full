import assert from 'node:assert/strict';
import test from 'node:test';
import { getNextSubscriptionDueDate, getSubscriptionPeriod } from './company-subscriptions.js';

test('creates stable subscription periods for each billing cadence', () => {
  assert.equal(getSubscriptionPeriod('2026-10-28', 'MONTHLY'), '2026-10');
  assert.equal(getSubscriptionPeriod('2026-10-28', 'YEARLY'), '2026');
  assert.equal(getSubscriptionPeriod('2026-10-28', 'ONCE'), '2026-10-28');
});

test('advances monthly billing without overflowing short months', () => {
  assert.equal(getNextSubscriptionDueDate('2026-01-31', 'MONTHLY'), '2026-02-28');
  assert.equal(getNextSubscriptionDueDate('2028-01-31', 'MONTHLY'), '2028-02-29');
  assert.equal(getNextSubscriptionDueDate('2026-10-28', 'MONTHLY'), '2026-11-28');
});

test('advances annual billing and leaves one-time accounts without another cycle', () => {
  assert.equal(getNextSubscriptionDueDate('2028-02-29', 'YEARLY'), '2029-02-28');
  assert.equal(getNextSubscriptionDueDate('2026-10-28', 'ONCE'), null);
});

test('rejects invalid billing periods', () => {
  assert.throws(() => getNextSubscriptionDueDate('2026-10-28', 'WEEKLY'), /Frequência/);
  assert.throws(() => getSubscriptionPeriod('28-10-2026', 'MONTHLY'), /Data/);
});
