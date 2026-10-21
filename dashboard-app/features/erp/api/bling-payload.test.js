import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlingSalesOrderPayload } from './bling-payload.js';

test('builds a manual Bling sales order with the order totals and item units', () => {
  const payload = buildBlingSalesOrderPayload({
    id: 'PED-123',
    createdAt: new Date('2026-10-19T12:00:00.000Z'),
    total: 'R$ 42,50',
    deliveryFee: '5.00',
    serviceFee: '2.50',
    couponDiscountAmount: '1.00',
    items: [{
      name: 'Produto por peso',
      productCode: 'SKU-42',
      quantity: 0.5,
      unit: 'kg',
      price: 'R$ 72,00',
    }],
  }, 123);

  assert.equal(payload.numeroLoja, 'HOJE-PED-123');
  assert.equal(payload.data, '2026-10-19');
  assert.deepEqual(payload.contato, { id: 123 });
  assert.equal(payload.itens[0].unidade, 'KG');
  assert.equal(payload.itens[0].quantidade, 0.5);
  assert.equal(payload.itens[0].valor, 72);
  assert.equal(payload.outrasDespesas, 2.5);
  assert.deepEqual(payload.desconto, { valor: 1, unidade: 'REAL' });
  assert.equal(payload.transporte.frete, 5);
  assert.equal(payload.parcelas[0].valor, 42.5);
  assert.doesNotMatch(payload.observacoes, /NF-e|gerar/i);
  assert.match(payload.observacoes, /Referência: PED-123/);
});

test('uses the order date in the store timezone', () => {
  const payload = buildBlingSalesOrderPayload({
    id: 'PED-123',
    createdAt: new Date('2026-10-19T01:00:00.000Z'),
    total: '10,00',
    items: [{ name: 'Produto', price: '10,00', quantity: 1 }],
  }, 123);

  assert.equal(payload.data, '2026-10-18');
});

test('rejects invalid totals, items, and contact identifiers', () => {
  const order = {
    id: 'PED-123',
    createdAt: new Date('2026-10-19T12:00:00.000Z'),
    total: '0',
    items: [{ name: 'Produto', price: '10,00', quantity: 1 }],
  };

  assert.throws(() => buildBlingSalesOrderPayload(order, 1), /total do pedido/);
  assert.throws(() => buildBlingSalesOrderPayload({ ...order, total: '10,00', items: [] }, 1), /não tem itens/);
  assert.throws(() => buildBlingSalesOrderPayload({ ...order, total: '10,00' }, 0), /contato/);
});
