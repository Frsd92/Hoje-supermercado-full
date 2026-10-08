import { createHash } from 'node:crypto';
import { storeTrafficPeriodOptions } from './periods.js';

export const storePresenceCookieName = 'hoje_store_presence';
export const storePresenceActiveWindowMs = 90_000;
export const storePresenceHeartbeatMs = 30_000;
export const storePresenceSessionRetentionMs = 24 * 60 * 60 * 1000;
export const storePresenceSnapshotRetentionMs = 30 * 24 * 60 * 60 * 1000;

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

function saoPauloParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
}

function getSaoPauloHourStart(date) {
  const parts = saoPauloParts(date);
  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) + 3,
  ));
}

function getSaoPauloDayStart(date) {
  const parts = saoPauloParts(date);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 3));
}

function periodConfig(period, now) {
  if (period === '24h') {
    const currentHour = getSaoPauloHourStart(now);
    return { firstBucket: new Date(currentHour.getTime() - 23 * hourMs), bucketMs: hourMs, bucketCount: 24, unit: 'hour' };
  }
  if (period === '7d') {
    const today = getSaoPauloDayStart(now);
    return { firstBucket: new Date(today.getTime() - 6 * dayMs), bucketMs: dayMs, bucketCount: 7, unit: 'day' };
  }
  if (period === '30d') {
    const today = getSaoPauloDayStart(now);
    return { firstBucket: new Date(today.getTime() - 29 * dayMs), bucketMs: dayMs, bucketCount: 30, unit: 'day' };
  }
  throw new RangeError('Período de tráfego inválido.');
}

export function isStoreTrafficPeriod(period) {
  return storeTrafficPeriodOptions.some((option) => option.value === period);
}

export function getStoreTrafficPeriodStart(period, now = new Date()) {
  return periodConfig(period, now).firstBucket;
}

export function isValidStorePresenceCookieId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function hashStorePresenceCookieId(value) {
  if (!isValidStorePresenceCookieId(value)) return null;
  return createHash('sha256').update(value).digest('hex');
}

export function buildStoreTrafficHistory({ snapshots, period, now = new Date(), trackingStartedAt }) {
  if (!trackingStartedAt) return [];

  const trackingStart = new Date(trackingStartedAt).getTime();
  if (!Number.isFinite(trackingStart)) throw new TypeError('Data inicial do histórico inválida.');

  const { firstBucket, bucketMs, bucketCount, unit } = periodConfig(period, now);
  const firstBucketTime = firstBucket.getTime();
  const firstVisibleIndex = Math.max(0, Math.floor((trackingStart - firstBucketTime) / bucketMs));
  if (firstVisibleIndex >= bucketCount) return [];

  const peaks = Array(bucketCount).fill(0);
  snapshots.forEach((snapshot) => {
    const sampledAt = new Date(snapshot.minute).getTime();
    const count = Number(snapshot.onlineVisitors);
    if (!Number.isFinite(sampledAt) || !Number.isInteger(count) || count < 0) {
      throw new TypeError('Amostra de tráfego inválida.');
    }
    const index = Math.floor((sampledAt - firstBucketTime) / bucketMs);
    if (index >= 0 && index < bucketCount) peaks[index] = Math.max(peaks[index], count);
  });

  return peaks.slice(firstVisibleIndex).map((onlineVisitors, offset) => {
    const index = firstVisibleIndex + offset;
    const start = new Date(firstBucketTime + index * bucketMs);
    const label = unit === 'hour'
      ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(start)
      : new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
      }).format(start);

    return { startAt: start.toISOString(), label, onlineVisitors };
  });
}
