import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeErpRecipientHandoff, storeErpRecipientHandoff } from './customer-recipient-handoff.js';

const storedValues = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => storedValues.get(key) ?? null,
    setItem: (key, value) => storedValues.set(key, String(value)),
    removeItem: (key) => storedValues.delete(key),
  },
};

test('normalizes and consumes a recipient only once', () => {
  storeErpRecipientHandoff(' Cliente@Example.com ', 'communications');

  assert.equal(consumeErpRecipientHandoff('communications'), 'cliente@example.com');
  assert.equal(consumeErpRecipientHandoff('communications'), null);
});

test('keeps communication and coupon recipients isolated', () => {
  storeErpRecipientHandoff('comunicado@example.com', 'communications');
  storeErpRecipientHandoff('cupom@example.com', 'promotions');

  assert.equal(consumeErpRecipientHandoff('communications'), 'comunicado@example.com');
  assert.equal(consumeErpRecipientHandoff('promotions'), 'cupom@example.com');
});

test('rejects unsupported destinations', () => {
  assert.throws(() => storeErpRecipientHandoff('cliente@example.com', 'unknown'), /Destino de destinatário inválido/);
  assert.throws(() => consumeErpRecipientHandoff('unknown'), /Destino de destinatário inválido/);
});
