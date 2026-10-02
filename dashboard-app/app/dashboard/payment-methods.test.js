import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHOD_UPDATED_EVENT,
  PAYMENT_METHODS,
  getPaymentMethodStorageKey,
  isPaymentMethod,
  savePaymentMethod,
} from './payment-methods.js';

test('exposes the payment methods supported by the existing checkout', () => {
  assert.deepEqual(PAYMENT_METHODS.map(({ value }) => value), ['pix', 'cartao', 'dinheiro', 'outro']);
  assert.equal(DEFAULT_PAYMENT_METHOD, 'pix');
  assert.equal(isPaymentMethod('cartao'), true);
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
