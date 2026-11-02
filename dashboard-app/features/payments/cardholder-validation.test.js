import assert from 'node:assert/strict';
import test from 'node:test';
import { cardholderNameMatchesProfile } from './cardholder-validation.js';

test('matches the cardholder name to the profile despite case, accents, and punctuation', () => {
  assert.equal(cardholderNameMatchesProfile('JOAO DA SILVA', 'João da Silva'), true);
  assert.equal(cardholderNameMatchesProfile('ANA-CLARA D’AVILA', 'Ana Clara D Avila'), true);
});

test('rejects different or missing cardholder names', () => {
  assert.equal(cardholderNameMatchesProfile('Maria Silva', 'João da Silva'), false);
  assert.equal(cardholderNameMatchesProfile('', 'João da Silva'), false);
  assert.equal(cardholderNameMatchesProfile('João da Silva', ''), false);
});
