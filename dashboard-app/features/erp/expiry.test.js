import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPIRY_BANDS, getExpiryStatus, saoPauloDateString } from './expiry.js';

const today = '2026-10-02';
const expiryAfter = (days) => new Date(`${today}T00:00:00.000Z`).getTime() + days * 86400000;
const dateAfter = (days) => new Date(expiryAfter(days)).toISOString().slice(0, 10);

test('classifies every requested urgency threshold using calendar days', () => {
  const cases = [
    [-1, 'overdue'],
    [0, 'day-1'],
    [1, 'day-1'],
    [2, 'day-3'],
    [3, 'day-3'],
    [4, 'day-5'],
    [5, 'day-5'],
    [6, 'day-10'],
    [10, 'day-10'],
    [11, 'day-15'],
    [15, 'day-15'],
    [16, 'day-30'],
    [30, 'day-30'],
    [31, 'day-45'],
    [45, 'day-45'],
    [46, 'safe'],
  ];

  for (const [days, key] of cases) {
    assert.equal(getExpiryStatus(dateAfter(days), today).key, key, `Expected ${days} days to use the ${key} band`);
  }
});

test('provides distinct, readable labels for every warning band', () => {
  assert.deepEqual(EXPIRY_BANDS.map(({ label }) => label), [
    'Vencido',
    'Até 1 dia',
    'Até 3 dias',
    'Até 5 dias',
    'Até 10 dias',
    'Até 15 dias',
    'Até 30 dias',
    'Até 45 dias',
  ]);
});

test('describes today, tomorrow, overdue and missing expiry dates clearly', () => {
  assert.equal(getExpiryStatus(dateAfter(0), today).detail, 'Vence hoje');
  assert.equal(getExpiryStatus(dateAfter(1), today).detail, 'Vence amanhã');
  assert.equal(getExpiryStatus(dateAfter(-1), today).detail, 'Vencido há 1 dia');
  assert.equal(getExpiryStatus('', today).key, 'missing');
  assert.equal(getExpiryStatus('', today, false).key, 'not-tracked');
});

test('rejects invalid calendar dates instead of reporting them as safe', () => {
  assert.equal(getExpiryStatus('2026-02-30', today).key, 'invalid');
});

test('uses the São Paulo calendar date for expiry calculations', () => {
  assert.equal(saoPauloDateString(new Date('2026-10-02T02:00:00.000Z')), '2026-10-01');
});
