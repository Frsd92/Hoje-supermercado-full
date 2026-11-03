import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDeliveryTrackingToken,
  deactivateDeliveryTracking,
  hashDeliveryTrackingToken,
  parseDeliveryLocation,
} from './delivery-tracking.js';

test('creates unique high-entropy driver tokens and stores only a stable hash', () => {
  const first = createDeliveryTrackingToken();
  const second = createDeliveryTrackingToken();

  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.notEqual(hashDeliveryTrackingToken(first), first);
  assert.equal(hashDeliveryTrackingToken(first), hashDeliveryTrackingToken(first));
});

test('accepts valid GPS readings and normalizes optional sensor data', () => {
  assert.deepEqual(parseDeliveryLocation({
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 18,
    heading: 120,
    speed: 8,
  }), {
    latitude: -23.5505,
    longitude: -46.6333,
    accuracy: 18,
    heading: 120,
    speed: 8,
  });
  assert.deepEqual(parseDeliveryLocation({
    latitude: 0,
    longitude: 0,
  }), {
    latitude: 0,
    longitude: 0,
    accuracy: null,
    heading: null,
    speed: null,
  });
});

test('rejects invalid coordinates and out-of-range sensor data', () => {
  for (const location of [
    { latitude: 90.01, longitude: 0 },
    { latitude: 0, longitude: -180.01 },
    { latitude: Number.NaN, longitude: 0 },
    { latitude: 0, longitude: 0, accuracy: -1 },
    { latitude: 0, longitude: 0, heading: 361 },
    { latitude: 0, longitude: 0, speed: 101 },
    null,
    [],
  ]) {
    assert.equal(parseDeliveryLocation(location), null);
  }
});

test('revokes an active delivery and clears its last known location', async () => {
  let update;
  await deactivateDeliveryTracking({
    deliveryTracking: {
      updateMany: async (args) => {
        update = args;
        return { count: 1 };
      },
    },
  }, 'order-123');

  assert.equal(update.where.orderId, 'order-123');
  assert.equal(update.where.active, true);
  assert.equal(update.data.active, false);
  assert.equal(update.data.tokenHash, null);
  assert.equal(update.data.latitude, null);
  assert.equal(update.data.longitude, null);
  assert.equal(update.data.locationUpdatedAt, null);
});
