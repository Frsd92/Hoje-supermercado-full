import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPriceChart, getEffectiveRecordedPrice, getNicePriceTicks, getPriceHistorySyncStatus, getPriceRangeStart, priceChartY } from './price-chart.js';

const date = (value) => new Date(value);

test('filters chart records by selected range and includes the last known price as its baseline', () => {
  const now = date('2026-09-30T18:00:00.000Z');
  const chart = buildPriceChart([
    { date: '2026-09-01T12:00:00.000Z', price: 5 },
    { date: '2026-09-28T12:00:00.000Z', price: 6 },
    { date: '2026-09-30T12:00:00.000Z', price: 7 },
  ], '5D', now);

  assert.equal(chart.points.length, 3);
  assert.equal(chart.points[0].price, 5);
  assert.equal(chart.points[0].baseline, true);
  assert.equal(chart.points[1].price, 6);
  assert.equal(chart.points[1].baseline, false);
  assert.equal(chart.points[2].price, 7);
});

test('1D starts at midnight in São Paulo and YTD starts on the local calendar year', () => {
  const now = date('2026-09-30T18:00:00.000Z');
  assert.equal(getPriceRangeStart('1D', now).toISOString(), '2026-09-30T03:00:00.000Z');
  assert.equal(getPriceRangeStart('YTD', now).toISOString(), '2026-01-01T03:00:00.000Z');
});

test('MAX includes all actual price records and filters out future-dated points', () => {
  const now = date('2026-09-30T18:00:00.000Z');
  const chart = buildPriceChart([
    { date: '2025-01-01T00:00:00.000Z', price: 4 },
    { date: '2026-09-30T17:00:00.000Z', price: 8 },
    { date: '2026-10-01T00:00:00.000Z', price: 9 },
  ], 'MAX', now);

  assert.deepEqual(chart.points.map((point) => point.price), [4, 8]);
});

test('price axis ticks are rounded, cover the data, and support a constant price', () => {
  const ticks = getNicePriceTicks(6.62, 7.46);
  assert.ok(ticks[0] <= 6.62);
  assert.ok(ticks.at(-1) >= 7.46);
  assert.ok(ticks.every((tick) => Number.isFinite(tick)));

  const constantTicks = getNicePriceTicks(7.46, 7.46);
  assert.ok(constantTicks[0] < 7.46);
  assert.ok(constantTicks.at(-1) > 7.46);
  const constantPriceY = priceChartY(7.46, constantTicks[0], constantTicks.at(-1));
  assert.ok(constantPriceY > 10 && constantPriceY < 88);
});

test('uses recorded discount to chart the actual effective retail price', () => {
  assert.equal(getEffectiveRecordedPrice({ price: 10, discount: 15 }), 8.5);
  const chart = buildPriceChart([
    { date: '2026-09-29T12:00:00.000Z', price: 10, discount: 10 },
    { date: '2026-09-30T12:00:00.000Z', price: 10, discount: 15 },
  ], 'MAX', date('2026-09-30T18:00:00.000Z'));
  assert.deepEqual(chart.points.map((point) => point.price), [9, 8.5]);
});

test('reports when current effective price differs from the latest actual record', () => {
  const history = [{ date: '2026-09-30T12:00:00.000Z', price: 38.43, discount: 0 }];
  assert.deepEqual(getPriceHistorySyncStatus(history, 58.43), {
    status: 'mismatch',
    currentPrice: 58.43,
    recordedPrice: 38.43,
  });
  assert.equal(getPriceHistorySyncStatus(history, 38.43).status, 'matched');
  assert.equal(getPriceHistorySyncStatus([], 58.43).status, 'missing');
});
