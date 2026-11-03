import { createHash, randomBytes } from 'node:crypto';

export const DELIVERY_TRACKING_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const DELIVERY_LOCATION_MIN_INTERVAL_MS = 2500;

export function createDeliveryTrackingToken() {
  return randomBytes(32).toString('hex');
}

export function hashDeliveryTrackingToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function parseDeliveryLocation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const { latitude, longitude, accuracy, heading, speed } = body;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (accuracy !== null && accuracy !== undefined
    && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) return null;
  if (heading !== null && heading !== undefined
    && (!Number.isFinite(heading) || heading < 0 || heading > 360)) return null;
  if (speed !== null && speed !== undefined
    && (!Number.isFinite(speed) || speed < 0 || speed > 100)) return null;

  return {
    latitude,
    longitude,
    accuracy: accuracy ?? null,
    heading: heading ?? null,
    speed: speed ?? null,
  };
}

export function deactivateDeliveryTracking(transaction, orderId) {
  return transaction.deliveryTracking.updateMany({
    where: { orderId, active: true },
    data: {
      active: false,
      tokenHash: null,
      latitude: null,
      longitude: null,
      accuracy: null,
      heading: null,
      speed: null,
      locationUpdatedAt: null,
    },
  });
}
