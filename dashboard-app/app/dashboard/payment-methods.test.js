import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHOD_UPDATED_EVENT,
  PAYMENT_METHODS,
  SAVED_CARD_UPDATED_EVENT,
  getPaymentMethodStorageKey,
  isPaymentMethod,
  readPaymentMethod,
  savePaymentMethod,
} from './payment-methods.js';

test('exposes only payment methods available to customers', () => {
  assert.deepEqual(PAYMENT_METHODS.map(({ value }) => value), ['pix', 'cartao']);
  assert.doesNotMatch(PAYMENT_METHODS.map(({ label, description }) => `${label} ${description}`).join(' '), /pagar[.]me/i);
  assert.equal(PAYMENT_METHODS.find(({ value }) => value === 'cartao').label, 'Cartão de crédito');
  assert.equal(PAYMENT_METHODS.find(({ value }) => value === 'pix').recommended, true);
  assert.match(PAYMENT_METHODS.find(({ value }) => value === 'pix').description, /QR Code.*Pix copia e cola/);
  assert.equal(DEFAULT_PAYMENT_METHOD, 'pix');
  assert.equal(SAVED_CARD_UPDATED_EVENT, 'dashboard-saved-card-updated');
  assert.equal(isPaymentMethod('cartao'), true);
  assert.equal(isPaymentMethod('dinheiro'), false);
  assert.equal(isPaymentMethod('outro'), false);
  assert.equal(isPaymentMethod('transferencia'), false);
});

test('scopes a saved payment preference to its account email', () => {
  assert.equal(
    getPaymentMethodStorageKey('cliente@example.com'),
    'hoje-dashboard-payment-method-cliente@example.com',
  );
  assert.equal(getPaymentMethodStorageKey(''), 'hoje-dashboard-payment-method-guest');
});

test('saves the preference for the account and notifies the checkout', () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalWindow = globalThis.window;
  const storedValues = new Map();
  const dispatchedEvents = [];

  globalThis.localStorage = {
    setItem: (key, value) => storedValues.set(key, value),
  };
  globalThis.window = {
    dispatchEvent: (event) => dispatchedEvents.push(event),
  };

  try {
    savePaymentMethod('cliente@example.com', 'cartao');
    assert.equal(storedValues.get(getPaymentMethodStorageKey('cliente@example.com')), 'cartao');
    assert.equal(dispatchedEvents[0].type, PAYMENT_METHOD_UPDATED_EVENT);
    assert.deepEqual(dispatchedEvents[0].detail, { email: 'cliente@example.com', method: 'cartao' });
    assert.throws(() => savePaymentMethod('cliente@example.com', 'transferencia'), /forma de pagamento disponível/);
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('defaults to Pix only when the account has no valid saved preference', () => {
  const originalLocalStorage = globalThis.localStorage;
  const storedValues = new Map();
  globalThis.localStorage = {
    getItem: (key) => storedValues.get(key) ?? null,
  };

  try {
    assert.equal(readPaymentMethod('cliente@example.com'), 'pix');
    storedValues.set(getPaymentMethodStorageKey('cliente@example.com'), 'invalid');
    assert.equal(readPaymentMethod('cliente@example.com'), 'pix');
    storedValues.set(getPaymentMethodStorageKey('cliente@example.com'), 'outro');
    assert.equal(readPaymentMethod('cliente@example.com'), 'pix');
    storedValues.set(getPaymentMethodStorageKey('cliente@example.com'), 'pix');
    assert.equal(readPaymentMethod('cliente@example.com'), 'pix');
    storedValues.set(getPaymentMethodStorageKey('cliente@example.com'), 'cartao');
    assert.equal(readPaymentMethod('cliente@example.com'), 'cartao');
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});
