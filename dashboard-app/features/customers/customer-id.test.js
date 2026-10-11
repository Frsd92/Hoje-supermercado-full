import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCustomerId } from './customer-id.js';

test('formats a persisted customer ID as a stable customer code', () => {
  assert.equal(formatCustomerId('cmf123abc'), 'CLI-CMF123ABC');
});

test('returns an empty code when no persisted ID is available', () => {
  assert.equal(formatCustomerId(''), '');
  assert.equal(formatCustomerId(null), '');
});
