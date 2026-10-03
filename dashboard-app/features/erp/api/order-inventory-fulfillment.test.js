import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateOrderInventory } from './order-inventory-fulfillment.js';

function createTransaction() {
  let product = {
    id: 'product-1',
    externalId: 'MILK-1',
    title: 'Leite',
    quantity: 30,
    metadata: { controlsExpiry: true },
  };
  const lots = [
    { id: 'lot-late', productId: 'product-1', lotCode: 'C', quantity: 10, expiry: '2026-11-21', createdAt: '2026-10-01' },
    { id: 'lot-soon', productId: 'product-1', lotCode: 'A', quantity: 10, expiry: '2026-10-09', createdAt: '2026-10-01' },
    { id: 'lot-mid', productId: 'product-1', lotCode: 'B', quantity: 10, expiry: '2026-10-17', createdAt: '2026-10-01' },
  ];
  let fulfillment = null;
  const allocations = [];
  const audits = [];

  const transaction = {
    inventoryOrderFulfillment: {
      findUnique: async () => fulfillment,
      create: async ({ data }) => { fulfillment = data; return data; },
    },
    inventoryLotAllocation: {
      createMany: async ({ data }) => { allocations.push(...data); return { count: data.length }; },
    },
    product: {
      findMany: async () => [product],
      findUnique: async () => product,
      update: async ({ data }) => { product = { ...product, ...data }; return product; },
    },
    productLot: {
      findMany: async () => lots.filter((lot) => lot.quantity > 0),
      updateMany: async ({ where, data }) => {
        const lot = lots.find((entry) => entry.id === where.id && entry.quantity >= where.quantity.gte);
        if (!lot) return { count: 0 };
        lot.quantity -= data.quantity.decrement;
        return { count: 1 };
      },
    },
    productAuditLog: {
      create: async ({ data }) => { audits.push(data); return data; },
    },
  };

  return {
    transaction,
    lots,
    allocations,
    audits,
    get fulfillment() { return fulfillment; },
    get product() { return product; },
  };
}

test('allocates FEFO stock, records the lots, and does not debit the same order twice', async () => {
  const database = createTransaction();
  const order = { id: 'PED-1', items: [{ productId: 'MILK-1', name: 'Leite', quantity: 15 }] };

  const firstResult = await allocateOrderInventory(database.transaction, order, 'Operador', '2026-10-02');
  assert.deepEqual(database.allocations.map(({ lotId, quantity }) => [lotId, quantity]), [
    ['lot-soon', 10],
    ['lot-mid', 5],
  ]);
  assert.equal(database.product.quantity, 15);
  assert.equal(database.fulfillment.orderId, 'PED-1');
  assert.equal(firstResult.alreadyAllocated, false);

  const secondResult = await allocateOrderInventory(database.transaction, order, 'Operador', '2026-10-02');
  assert.equal(secondResult.alreadyAllocated, true);
  assert.equal(database.allocations.length, 2);
  assert.equal(database.product.quantity, 15);
  assert.equal(database.audits.length, 1);
});

test('rejects insufficient valid stock without reserving any lot', async () => {
  const database = createTransaction();
  const order = { id: 'PED-2', items: [{ productId: 'MILK-1', name: 'Leite', quantity: 31 }] };

  const result = await allocateOrderInventory(database.transaction, order, 'Operador', '2026-10-02');

  assert.match(result.error, /Estoque válido insuficiente/);
  assert.equal(database.fulfillment, null);
  assert.equal(database.allocations.length, 0);
  assert.equal(database.product.quantity, 30);
});
