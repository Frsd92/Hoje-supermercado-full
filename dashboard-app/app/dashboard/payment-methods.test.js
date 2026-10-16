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
import {
  CARD_PAYMENT_METHODS,
  getExpectedCardType,
  getSavedCardType,
  getSavedCardTypeLabel,
  isCardPaymentMethod,
  isCardTypeCompatible,
  isKnownCardType,
  isVoucherPaymentMethod,
  MAX_SAVED_CARDS,
  normalizePaymentMethod,
  SAVED_CARD_TYPES,
  VOUCHER_PAYMENT_METHODS,
} from '../../features/payments/card-methods.js';

test('exposes only payment methods available to customers', () => {
  assert.deepEqual(PAYMENT_METHODS.map(({ value }) => value), ['pix', 'cartao_credito', 'cartao_debito', 'vale_alimentacao', 'vale_refeicao']);
  assert.doesNotMatch(PAYMENT_METHODS.map(({ label, description }) => `${label} ${description}`).join(' '), /pagar[.]me/i);
  assert.equal(PAYMENT_METHODS.find(({ value }) => value === 'cartao_credito').label, 'Cartão de crédito');
  assert.equal(PAYMENT_METHODS.find(({ value }) => value === 'cartao_debito').label, 'Cartão de débito');
  assert.equal(PAYMENT_METHODS.find(({ value }) => value === 'pix').recommended, true);
  assert.match(PAYMENT_METHODS.find(({ value }) => value === 'pix').description, /QR Code.*Pix copia e cola/);
  assert.equal(DEFAULT_PAYMENT_METHOD, 'pix');
  assert.equal(SAVED_CARD_UPDATED_EVENT, 'dashboard-saved-card-updated');
  assert.equal(isPaymentMethod('cartao'), true);
  assert.equal(isPaymentMethod('vale_alimentacao'), true);
  assert.equal(isPaymentMethod('vale_refeicao'), true);
  assert.deepEqual(CARD_PAYMENT_METHODS, ['cartao_credito', 'cartao_debito']);
  assert.deepEqual(VOUCHER_PAYMENT_METHODS, ['vale_alimentacao', 'vale_refeicao']);
  assert.deepEqual(SAVED_CARD_TYPES, ['credit', 'debit', 'food_voucher', 'meal_voucher']);
  assert.equal(MAX_SAVED_CARDS, 10);
  assert.equal(normalizePaymentMethod('cartao'), 'cartao_credito');
  assert.equal(getExpectedCardType('cartao_credito'), 'credit');
  assert.equal(getExpectedCardType('cartao_debito'), 'debit');
  assert.equal(getExpectedCardType('cartao'), 'credit');
  assert.equal(getExpectedCardType('vale_alimentacao'), 'food_voucher');
  assert.equal(getExpectedCardType('vale_refeicao'), 'meal_voucher');
  assert.equal(getExpectedCardType('pix'), null);
  assert.equal(isCardTypeCompatible('credit', 'cartao_credito'), true);
  assert.equal(isCardTypeCompatible('credit', 'cartao_debito'), false);
  assert.equal(isCardTypeCompatible(null, 'cartao_credito'), false);
  assert.equal(isCardTypeCompatible('food_voucher', 'vale_alimentacao'), true);
  assert.equal(isCardTypeCompatible('food_voucher', 'vale_refeicao'), false);
  assert.equal(isVoucherPaymentMethod('vale_alimentacao'), true);
  assert.equal(isVoucherPaymentMethod('vale_refeicao'), true);
  assert.equal(isVoucherPaymentMethod('cartao_credito'), false);
  assert.equal(isCardPaymentMethod('vale_alimentacao'), true);
  assert.equal(isCardPaymentMethod('vale_refeicao'), true);
  assert.equal(isKnownCardType('debit'), true);
  assert.equal(isKnownCardType('food_voucher'), true);
  assert.equal(isKnownCardType(null), false);
  assert.equal(getSavedCardTypeLabel('debit'), 'Hoje Supermercado - Débito');
  assert.equal(getSavedCardTypeLabel('food_voucher'), 'Hoje Supermercado - Vale-alimentação');
  assert.equal(getSavedCardType({ type: 'credit', label: 'Hoje Supermercado - Débito' }), 'debit');
  assert.equal(getSavedCardType({ type: 'voucher', label: 'Hoje Supermercado - Vale-refeição' }), 'meal_voucher');
  assert.equal(getSavedCardType({ type: 'debit' }), 'debit');
  assert.equal(getSavedCardType({ type: 'unknown' }), null);
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
    assert.equal(storedValues.get(getPaymentMethodStorageKey('cliente@example.com')), 'cartao_credito');
    assert.equal(dispatchedEvents[0].type, PAYMENT_METHOD_UPDATED_EVENT);
    assert.deepEqual(dispatchedEvents[0].detail, { email: 'cliente@example.com', method: 'cartao_credito' });
    savePaymentMethod('cliente@example.com', 'cartao_debito');
    assert.equal(storedValues.get(getPaymentMethodStorageKey('cliente@example.com')), 'cartao_debito');
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
    assert.equal(readPaymentMethod('cliente@example.com'), 'cartao_credito');
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});
