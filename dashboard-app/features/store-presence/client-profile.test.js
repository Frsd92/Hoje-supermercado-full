import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStoreTrafficClientCounts,
  buildStoreTrafficClientItems,
  buildStoreTrafficClientPeaks,
  classifyStoreClient,
} from './client-profile.js';
import { getStoreTrafficPeriodStart } from './metrics.js';

test('classifies mobile Chrome, desktop Edge, iPad Safari, and embedded browsers', () => {
  assert.deepEqual(classifyStoreClient('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36'), {
    deviceType: 'mobile',
    browser: 'chrome',
  });
  assert.deepEqual(classifyStoreClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Edg/129.0.0.0'), {
    deviceType: 'desktop',
    browser: 'edge',
  });
  assert.deepEqual(classifyStoreClient('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), {
    deviceType: 'tablet',
    browser: 'safari',
  });
  assert.deepEqual(classifyStoreClient('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36'), {
    deviceType: 'mobile',
    browser: 'webview',
  });
});

test('keeps missing user-agent values unclassified without storing the raw value', () => {
  assert.deepEqual(classifyStoreClient(null), { deviceType: 'unknown', browser: 'unknown' });
  assert.deepEqual(classifyStoreClient(''), { deviceType: 'unknown', browser: 'unknown' });
});

test('aggregates grouped active sessions into broad device and browser categories', () => {
  const counts = buildStoreTrafficClientCounts([
    { deviceType: 'mobile', browser: 'chrome', count: 3 },
    { deviceType: 'mobile', browser: 'safari', count: 2 },
    { deviceType: 'desktop', browser: 'edge', count: 1 },
  ]);
  const items = buildStoreTrafficClientItems(counts);

  assert.equal(items.devices.find((item) => item.key === 'mobile').count, 5);
  assert.equal(items.devices.find((item) => item.key === 'desktop').count, 1);
  assert.equal(items.browsers.find((item) => item.key === 'chrome').count, 3);
  assert.equal(items.browsers.find((item) => item.key === 'safari').count, 2);
});

test('reports the maximum simultaneous count per category over the selected period', () => {
  const now = new Date('2026-10-08T15:35:00.000Z');
  const periodStart = getStoreTrafficPeriodStart('24h', now);
  const peaks = buildStoreTrafficClientPeaks({
    period: '24h',
    now,
    periodStart,
    snapshots: [
      {
        minute: new Date(periodStart.getTime() + 5 * 60_000),
        deviceCounts: { mobile: 2, tablet: 0, desktop: 1, other: 0, unknown: 0 },
        browserCounts: { chrome: 2, safari: 0, edge: 1, firefox: 0, 'samsung-internet': 0, opera: 0, webview: 0, other: 0, unknown: 0 },
      },
      {
        minute: new Date(periodStart.getTime() + 10 * 60_000),
        deviceCounts: { mobile: 4, tablet: 1, desktop: 0, other: 0, unknown: 0 },
        browserCounts: { chrome: 1, safari: 3, edge: 0, firefox: 0, 'samsung-internet': 1, opera: 0, webview: 0, other: 0, unknown: 0 },
      },
      {
        minute: new Date(periodStart.getTime() - 60_000),
        deviceCounts: { mobile: 20, tablet: 0, desktop: 0, other: 0, unknown: 0 },
        browserCounts: { chrome: 20, safari: 0, edge: 0, firefox: 0, 'samsung-internet': 0, opera: 0, webview: 0, other: 0, unknown: 0 },
      },
    ],
  });

  assert.equal(peaks.devices.find((item) => item.key === 'mobile').count, 4);
  assert.equal(peaks.devices.find((item) => item.key === 'tablet').count, 1);
  assert.equal(peaks.devices.find((item) => item.key === 'desktop').count, 1);
  assert.equal(peaks.browsers.find((item) => item.key === 'chrome').count, 2);
  assert.equal(peaks.browsers.find((item) => item.key === 'safari').count, 3);
});

test('does not report historical device or browser peaks before breakdown snapshots exist', () => {
  const now = new Date('2026-10-08T15:35:00.000Z');

  assert.equal(buildStoreTrafficClientPeaks({
    snapshots: [{ minute: now, deviceCounts: null, browserCounts: null }],
    period: '24h',
    now,
    periodStart: getStoreTrafficPeriodStart('24h', now),
  }), null);
});
