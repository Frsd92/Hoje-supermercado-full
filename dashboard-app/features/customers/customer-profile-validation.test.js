import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidFullName } from './customer-profile-validation.js';

test('accepts full names with accents, particles, hyphens, apostrophes, and initials', () => {
  for (const name of ['João da Silva', 'Ana-Clara D’Ávila', 'J. R. R. Tolkien']) {
    assert.equal(isValidFullName(name), true, name);
  }
});

test('rejects empty names, single names, and name parts containing numbers or symbols', () => {
  for (const name of ['', 'Maria', 'João 123', 'João @Silva', '   ']) {
    assert.equal(isValidFullName(name), false, name);
  }
});
