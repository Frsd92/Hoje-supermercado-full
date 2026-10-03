import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryQuantityMilliUnits, parseInventoryDate, planFefoAllocations, requiresInventoryExpiry } from './inventory-lots.js';

const product = { id: 'prod-1', externalId: 'SKU-1', title: 'Leite', metadata: { controlsExpiry: true } };
const lots = [
  { id: 'lot-50', productId: 'prod-1', lotCode: 'C', quantity: 10, expiry: '2026-11-21', createdAt: '2026-10-01' },
  { id: 'lot-7', productId: 'prod-1', lotCode: 'A', quantity: 10, expiry: '2026-10-09', createdAt: '2026-10-01' },
  { id: 'lot-15', productId: 'prod-1', lotCode: 'B', quantity: 10, expiry: '2026-10-17', createdAt: '2026-10-01' },
];

test('allocates demand by earliest expiry and splits quantities across lots', () => {
  const plan = planFefoAllocations({
    items: [{ productId: 'SKU-1', name: 'Leite', quantity: 15 }],
    products: [product],
    lots,
    today: '2026-10-02',
  });

  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.allocations.map(({ lotId, quantityMilliUnits }) => [lotId, quantityMilliUnits]), [
    ['lot-7', 10_000],
    ['lot-15', 5_000],
  ]);
});

test('does not allocate expired stock or stock with unknown validity for controlled products', () => {
  const plan = planFefoAllocations({
    items: [{ productId: 'SKU-1', name: 'Leite', quantity: 2 }],
    products: [product],
    lots: [
      { id: 'expired', productId: 'prod-1', quantity: 10, expiry: '2026-10-01' },
      { id: 'unknown', productId: 'prod-1', quantity: 10, expiry: null },
    ],
    today: '2026-10-02',
  });

  assert.match(plan.error, /saldo sem validade cadastrada/);
});

test('rejects the whole plan when a requested quantity exceeds the valid stock', () => {
  const plan = planFefoAllocations({
    items: [{ productId: 'SKU-1', name: 'Leite', quantity: 31 }],
    products: [product],
    lots,
    today: '2026-10-02',
  });

  assert.match(plan.error, /Estoque válido insuficiente/);
  assert.equal(plan.allocations, undefined);
});

test('allows lots without expiration only for products that do not control validity', () => {
  const plan = planFefoAllocations({
    items: [{ productId: 'prod-2', name: 'Arroz', quantity: 2 }],
    products: [{ id: 'prod-2', title: 'Arroz', metadata: {} }],
    lots: [{ id: 'lot-rice', productId: 'prod-2', quantity: 5, expiry: null }],
    today: '2026-10-02',
  });

  assert.equal(plan.error, undefined);
  assert.equal(plan.allocations[0].lotId, 'lot-rice');
});

test('does not guess a product when an order item title is ambiguous', () => {
  const plan = planFefoAllocations({
    items: [{ name: 'Leite', quantity: 1 }],
    products: [
      { id: 'milk-1', title: 'Leite', metadata: {} },
      { id: 'milk-2', title: 'Leite', metadata: {} },
    ],
    lots: [],
    today: '2026-10-02',
  });

  assert.match(plan.error, /não está vinculado ao catálogo/);
});

test('validates inventory quantities and date-only values', () => {
  assert.equal(inventoryQuantityMilliUnits('10.125'), 10_125);
  assert.equal(inventoryQuantityMilliUnits('10.1255'), null);
  assert.equal(parseInventoryDate('2026-02-28')?.toISOString(), '2026-02-28T00:00:00.000Z');
  assert.equal(parseInventoryDate('2026-02-30'), undefined);
  assert.equal(requiresInventoryExpiry({ metadata: { perishable: true } }), true);
  assert.equal(requiresInventoryExpiry({ metadata: { controlsExpiry: false } }), false);
});
