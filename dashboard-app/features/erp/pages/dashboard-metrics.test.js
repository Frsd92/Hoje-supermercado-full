import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDashboardMetrics } from './dashboard-metrics.js';

test('derives commercial and operational indicators from current ERP data', () => {
  const metrics = deriveDashboardMetrics({
    now: new Date(2026, 9, 3, 12),
    products: [
      { id: 'p1', title: 'Leite', status: 'Ativo', quantity: 4, cost: 40 },
      { id: 'p2', title: 'Arroz', status: 'Ativo', quantity: 2, cost: 10 },
      { id: 'p3', title: 'Feijão', status: 'Ativo', quantity: 0, cost: 8 },
      { id: 'p4', title: 'Produto inativo', status: 'Inativo', quantity: 0, cost: 5 },
    ],
    orders: [
      { status: 'Concluido', createdAt: '03/10/2026 10:00', total: 'R$ 150,00', items: [{ productId: 'p1', quantity: 2 }] },
      { status: 'Recebido', createdAt: '2026-10-02T12:00:00', total: 'R$ 50,00', items: [{ productId: 'p2', quantity: 1 }] },
      { status: 'Cancelado', createdAt: '2026-10-03T10:00:00', total: 'R$ 500,00', items: [{ productId: 'p1', quantity: 1 }] },
    ],
    customers: [{ status: 'Ativo' }, { status: 'Ativo' }, { status: 'Inativo' }],
    lots: [
      { quantity: 2, expiry: '2026-10-02' },
      { quantity: 1, expiry: '2026-10-06' },
      { quantity: 3, expiry: '2026-11-02' },
      { quantity: 0, expiry: '2026-10-04' },
    ],
  });

  assert.equal(metrics.monthlyRevenue, 200);
  assert.equal(metrics.monthOrderCount, 2);
  assert.equal(metrics.averageTicket, 100);
  assert.ok(Math.abs(metrics.averageMarginPercent - 55) < 1e-9);
  assert.equal(metrics.activeProductCount, 3);
  assert.equal(metrics.activeCustomerCount, 2);
  assert.equal(metrics.pendingOrderCount, 1);
  assert.equal(metrics.outOfStockProductCount, 1);
  assert.equal(metrics.expiredLotsCount, 1);
  assert.equal(metrics.expiringLotsInSevenDaysCount, 1);
  assert.equal(metrics.expiringLotsInThirtyDaysCount, 2);
});

test('does not report a fabricated margin when sales or product costs are unavailable', () => {
  const noSales = deriveDashboardMetrics({ products: [], orders: [] });
  const missingCosts = deriveDashboardMetrics({
    now: new Date(2026, 9, 3, 12),
    products: [{ id: 'p1', title: 'Leite', status: 'Ativo', cost: 0 }],
    orders: [{ status: 'Concluido', createdAt: '2026-10-03T10:00:00', total: 'R$ 10,00', items: [{ productId: 'p1', quantity: 1 }] }],
  });

  assert.equal(noSales.averageMarginPercent, null);
  assert.equal(missingCosts.averageMarginPercent, null);
});
