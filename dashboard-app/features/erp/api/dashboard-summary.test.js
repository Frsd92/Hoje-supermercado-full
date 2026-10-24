import test from 'node:test';
import assert from 'node:assert/strict';

import { countDashboardCustomers, mergeDashboardProducts } from './dashboard-summary.js';

test('merges compact database products over legacy products using catalog identity', () => {
  assert.deepEqual(mergeDashboardProducts(
    [{ id: 'db-1', externalId: 'legacy-1', title: 'Updated', status: 'Ativo', quantity: 2 }],
    [
      { id: 'legacy-1', title: 'Old', status: 'Ativo', quantity: 1 },
      { id: 'legacy-2', title: 'Legacy', status: 'Ativo', quantity: 0 },
    ],
  ), [
    { id: 'db-1', externalId: 'legacy-1', title: 'Updated', status: 'Ativo', quantity: 2 },
    { id: 'legacy-2', title: 'Legacy', status: 'Ativo', quantity: 0 },
  ]);
});

test('counts unique valid customer emails across compact data sources', () => {
  assert.equal(countDashboardCustomers([
    ['Customer@example.com', 'invalid'],
    ['customer@example.com', 'other@example.com '],
    [''],
  ]), 2);
});
