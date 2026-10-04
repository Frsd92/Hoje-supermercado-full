import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAbandonedCarts } from './abandoned-carts.js';

const now = new Date('2026-10-03T12:00:00.000Z');
const item = (name, quantity = 1, saleUnit = 'Unidade') => ({ name, quantity, saleUnit });

function summarize({ customerCarts = [], guestCarts = [], profilesByEmail = new Map(), customerOrdersForInsights = new Map() } = {}) {
  return summarizeAbandonedCarts({ customerCarts, guestCarts, profilesByEmail, customerOrdersForInsights, now });
}

test('includes stale customer and visitor carts while ignoring active and empty carts', () => {
  const result = summarize({
    customerCarts: [
      { email: 'cliente@example.com', items: [item('Arroz')], updatedAt: new Date(now.getTime() - 25 * 60 * 60 * 1000) },
      { email: 'recente@example.com', items: [item('Feijão')], updatedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000) },
      { email: 'vazio@example.com', items: [], updatedAt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
    ],
    guestCarts: [
      { id: 'private-guest-token', items: [item('Arroz', 2)], updatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      { id: 'active-guest-token', items: [item('Leite')], updatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
    ],
  });

  assert.equal(result.total, 2);
  assert.equal(result.customers.length, 1);
  assert.equal(result.guestCarts, 1);
  assert.equal(result.carts.length, 2);
  assert.equal(result.carts[1].type, 'guest');
  assert.equal(result.carts[1].name, 'Visitante sem cadastro');
  assert.equal(result.carts[1].email, null);
  assert.equal(Object.hasOwn(result.carts[1], 'id'), false);
  assert.deepEqual(result.topProducts, [{ label: 'Arroz', carts: 2, quantity: 3, saleUnit: 'Unidade' }]);
});

test('matches customer names by normalized email and preserves weighed quantities', () => {
  const profilesByEmail = new Map([['cliente@example.com', { fullName: 'Cliente Teste' }]]);
  const result = summarize({
    customerCarts: [{
      email: 'Cliente@Example.com',
      items: [item('Tomate', 1.25, 'Quilograma')],
      updatedAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
    }],
    profilesByEmail,
  });

  assert.equal(result.customers[0].name, 'Cliente Teste');
  assert.equal(result.customers[0].items[0].quantity, 1.3);
  assert.equal(result.customers[0].items[0].saleUnit, 'Quilograma');
});

test('does not classify carts without a reliable activity date as stale', () => {
  const result = summarize({
    customerCarts: [{ email: 'cliente@example.com', items: [item('Arroz')], updatedAt: null }],
    guestCarts: [{ items: [item('Leite')], updatedAt: 'data-inválida' }],
  });

  assert.equal(result.total, 0);
  assert.equal(result.cartsWithoutActivityDate, 2);
});
