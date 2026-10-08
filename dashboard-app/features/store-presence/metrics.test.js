import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoreTrafficHistory,
  getStoreTrafficPeriodStart,
  hashStorePresenceCookieId,
  isValidStorePresenceCookieId,
} from './metrics.js';

test('hashes only valid anonymous session cookie identifiers', () => {
  const cookieId = 'de305d54-75b4-431b-adb2-eb6b9e546014';
  const storedId = hashStorePresenceCookieId(cookieId);

  assert.equal(isValidStorePresenceCookieId(cookieId), true);
  assert.equal(storedId.length, 64);
  assert.notEqual(storedId, cookieId);
  assert.equal(hashStorePresenceCookieId('customer@example.com'), null);
  assert.equal(isValidStorePresenceCookieId('not-a-session-id'), false);
});

test('builds hourly peaks and fills gaps with zero after tracking has started', () => {
  const now = new Date('2026-10-08T15:35:00.000Z');
  const firstBucket = getStoreTrafficPeriodStart('24h', now);
  const trackingStartedAt = new Date(firstBucket.getTime() - 2 * 60 * 60 * 1000);
  const history = buildStoreTrafficHistory({
    period: '24h',
    now,
    trackingStartedAt,
    snapshots: [
      { minute: new Date(firstBucket.getTime() + 5 * 60 * 1000), onlineVisitors: 2 },
      { minute: new Date(firstBucket.getTime() + 35 * 60 * 1000), onlineVisitors: 5 },
      { minute: new Date(firstBucket.getTime() + 60 * 60 * 1000), onlineVisitors: 1 },
      { minute: new Date(firstBucket.getTime() - 60 * 60 * 1000), onlineVisitors: 99 },
    ],
  });

  assert.equal(history.length, 24);
  assert.equal(history[0].onlineVisitors, 5);
  assert.equal(history[1].onlineVisitors, 1);
  assert.equal(history[2].onlineVisitors, 0);
  assert.equal(history.at(-1).onlineVisitors, 0);
});

test('does not invent history before the first recorded sample', () => {
  const now = new Date('2026-10-08T15:35:00.000Z');
  const firstBucket = getStoreTrafficPeriodStart('24h', now);
  const trackingStartedAt = new Date(firstBucket.getTime() + 3 * 60 * 60 * 1000 + 15 * 60 * 1000);
  const history = buildStoreTrafficHistory({
    period: '24h',
    now,
    trackingStartedAt,
    snapshots: [{ minute: trackingStartedAt, onlineVisitors: 3 }],
  });

  assert.equal(history.length, 21);
  assert.equal(history[0].onlineVisitors, 3);
});

test('returns daily peak history for seven-day and thirty-day views', () => {
  const now = new Date('2026-10-08T15:35:00.000Z');
  const weekStart = getStoreTrafficPeriodStart('7d', now);
  const history = buildStoreTrafficHistory({
    period: '7d',
    now,
    trackingStartedAt: weekStart,
    snapshots: [
      { minute: new Date(weekStart.getTime() + 20 * 60 * 1000), onlineVisitors: 2 },
      { minute: new Date(weekStart.getTime() + 5 * 60 * 60 * 1000), onlineVisitors: 4 },
    ],
  });

  assert.equal(history.length, 7);
  assert.equal(history[0].onlineVisitors, 4);
  assert.equal(history[1].onlineVisitors, 0);

  const monthStart = getStoreTrafficPeriodStart('30d', now);
  const month = buildStoreTrafficHistory({
    period: '30d',
    now,
    trackingStartedAt: monthStart,
    snapshots: [],
  });
  assert.equal(month.length, 30);
  assert.ok(month.every((point) => point.onlineVisitors === 0));
});
