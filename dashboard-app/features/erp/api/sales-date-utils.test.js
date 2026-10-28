import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSaleDateTime, getSaleDateKey, isSaleDateInRange } from './sales-date-utils.js';

test('formats sales date and time using Sao Paulo local time', () => {
  const instant = '2026-10-28T03:30:00.000Z';

  assert.equal(getSaleDateKey(instant), '2026-10-28');
  assert.match(formatSaleDateTime(instant), /28\/10\/2026, 00:30/);
});

test('filters inclusively by local date and rejects invalid or reversed periods', () => {
  assert.equal(isSaleDateInRange('2026-10-28T02:00:00.000Z', '2026-10-27', '2026-10-27'), true);
  assert.equal(isSaleDateInRange('2026-10-28T03:00:00.000Z', '2026-10-27', '2026-10-27'), false);
  assert.equal(isSaleDateInRange('invalid', '', ''), false);
  assert.equal(isSaleDateInRange('2026-10-28T12:00:00.000Z', '2026-10-29', '2026-10-27'), false);
});
