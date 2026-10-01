import test from 'node:test';
import assert from 'node:assert/strict';

import { isNotificationVisibleToCustomer } from './notification-visibility.js';

const now = Date.parse('2026-09-30T12:00:00.000Z');

test('shows a general notification only while its explicit expiry is active', () => {
  assert.equal(isNotificationVisibleToCustomer({
    audience: 'all',
    expiresAt: '2026-10-01T12:00:00.000Z',
  }, 'new-customer@example.com', now), true);
  assert.equal(isNotificationVisibleToCustomer({
    audience: 'all',
    createdAt: '2026-09-17T12:00:00.000Z',
  }, 'new-customer@example.com', now), false);
});

test('shows a selected notification only to its listed recipients', () => {
  const notification = {
    audience: 'selected',
    recipients: ['customer@example.com'],
    expiresAt: '2026-10-01T12:00:00.000Z',
  };

  assert.equal(isNotificationVisibleToCustomer(notification, 'CUSTOMER@example.com', now), true);
  assert.equal(isNotificationVisibleToCustomer(notification, 'new-customer@example.com', now), false);
});

test('rejects expired, malformed, or unscoped notifications', () => {
  assert.equal(isNotificationVisibleToCustomer({
    audience: 'all',
    expiresAt: '2026-09-30T11:59:59.000Z',
  }, 'customer@example.com', now), false);
  assert.equal(isNotificationVisibleToCustomer({
    audience: 'selected',
    recipients: 'customer@example.com',
    expiresAt: '2026-10-01T12:00:00.000Z',
  }, 'customer@example.com', now), false);
  assert.equal(isNotificationVisibleToCustomer(null, 'customer@example.com', now), false);
});
