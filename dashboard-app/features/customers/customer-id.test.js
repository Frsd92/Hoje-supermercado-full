import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCustomerId, maskCpf } from './customer-id.js';

test('formats a persisted customer ID as a stable customer code', () => {
  assert.equal(formatCustomerId('cmf123abc'), 'CLI-CMF123ABC');
});

test('returns an empty code when no persisted ID is available', () => {
  assert.equal(formatCustomerId(''), '');
  assert.equal(formatCustomerId(null), '');
});

test('masks CPF values before they are shown in the ERP', () => {
  assert.equal(maskCpf('529.982.247-25'), '***.***.***-25');
  assert.equal(maskCpf(''), '');
  assert.equal(maskCpf('1234'), 'CPF cadastrado');
});
