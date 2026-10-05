import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPagarmeOrderPayload,
  getPagarmePaymentSnapshot,
  getPagarmePaymentStatus,
  getPagarmeRefundedCents,
  isValidCpf,
  pagarmeRequest,
  splitBrazilianMobilePhone,
} from './pagarme.js';

test('validates CPF and normalizes Brazilian mobile phones', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.deepEqual(splitBrazilianMobilePhone('+55 (11) 98765-4321'), {
    country_code: '55',
    area_code: '11',
    number: '987654321',
  });
  assert.equal(splitBrazilianMobilePhone('123'), null);
});

test('builds Pagar.me Pix orders using checked item totals and customer details', () => {
  const payload = buildPagarmeOrderPayload({
    orderId: 'PED-123',
    items: [{ name: 'Arroz', price: 'R$ 10,00', quantity: 2, productCode: '789' }],
    total: 'R$ 20,00',
    customer: {
      name: 'Cliente Hoje',
      email: 'cliente@example.com',
      cpf: '52998224725',
      phone: '(11) 98765-4321',
    },
    paymentMethod: 'pix',
  });

  assert.equal(payload.code, 'PED-123');
  assert.equal(payload.items[0].amount, 2000);
  assert.equal(payload.items[0].quantity, 1);
  assert.equal(payload.customer.document, '52998224725');
  assert.deepEqual(payload.payments[0], {
    payment_method: 'pix',
    pix: { expires_in: 3600 },
  });
});

test('requires the Pagar.me card token and billing address without accepting raw card data', () => {
  const base = {
    orderId: 'PED-123',
    items: [{ name: 'Leite', price: 'R$ 8,00', quantity: 1, productCode: 'LEITE' }],
    total: 'R$ 8,00',
    customer: {
      name: 'Cliente Hoje',
      email: 'cliente@example.com',
      cpf: '52998224725',
      phone: '11987654321',
    },
    paymentMethod: 'cartao',
    address: {
      street: 'Rua Um',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      stateCode: 'SP',
      cep: '01001-000',
    },
  };

  assert.throws(() => buildPagarmeOrderPayload({ ...base, cardToken: '4111111111111111' }), /tokenizado/);
  const payload = buildPagarmeOrderPayload({ ...base, cardToken: 'token_abc123' });
  const serialized = JSON.stringify(payload);
  assert.equal(payload.payments[0].payment_method, 'credit_card');
  assert.equal(payload.payments[0].credit_card.card_token, 'token_abc123');
  assert.equal(serialized.includes('4111111111111111'), false);
  assert.equal(serialized.includes('cvv'), false);
});

test('maps provider payment and refund results', () => {
  const order = {
    id: 'or_123',
    status: 'pending',
    charges: [{
      id: 'ch_123',
      status: 'pending',
      canceled_amount: 500,
      last_transaction: {
        qr_code: 'pix-copy-code',
        qr_code_url: 'https://api.pagar.me/core/v1/qrcode.png',
        expires_at: '2026-10-06T00:00:00Z',
      },
    }],
  };

  assert.equal(getPagarmePaymentStatus(order), 'pending');
  assert.deepEqual(getPagarmePaymentSnapshot(order), {
    pagarmeOrderId: 'or_123',
    pagarmeChargeId: 'ch_123',
    paymentStatus: 'pending',
    paymentDetails: {
      pixQrCode: 'pix-copy-code',
      pixQrCodeUrl: 'https://api.pagar.me/core/v1/qrcode.png',
      pixExpiresAt: '2026-10-06T00:00:00Z',
    },
  });
  assert.equal(getPagarmeRefundedCents(order), 500);
  assert.equal(getPagarmePaymentStatus({ status: 'paid' }), 'paid');
});

test('authenticates Pagar.me API requests with a secret key and rejects provider errors', async () => {
  let request;
  const result = await pagarmeRequest('/orders', {
    method: 'POST',
    body: { code: 'PED-1' },
    idempotencyKey: 'PED-1',
    secretKey: 'sk_test_example',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ id: 'or_1' }) };
    },
  });
  assert.equal(result.id, 'or_1');
  assert.equal(request.url, 'https://api.pagar.me/core/v5/orders');
  assert.equal(request.options.headers.Authorization, `Basic ${Buffer.from('sk_test_example:').toString('base64')}`);
  assert.equal(request.options.headers['Idempotency-Key'], 'PED-1');

  await assert.rejects(
    pagarmeRequest('/orders', {
      secretKey: 'sk_test_example',
      fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ errors: [{ message: 'private details' }] }) }),
    }),
    (error) => error.status === 422 && !error.message.includes('private details'),
  );
});
