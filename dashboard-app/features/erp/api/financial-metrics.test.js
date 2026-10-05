import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialMetrics } from './financial-metrics.js';

const order = ({
  id,
  createdAt = '2026-10-01T15:00:00.000Z',
  customerEmail = 'cliente@example.com',
  subtotal,
  total,
  couponCode = null,
  couponDiscountAmount = 0,
  status = 'Concluido',
  items = [],
}) => ({
  id,
  createdAt: new Date(createdAt),
  customerEmail,
  subtotal,
  total,
  couponCode,
  couponDiscountAmount,
  status,
  items,
});

const item = ({
  productId,
  name,
  price,
  quantity = 1,
  unitCost,
  promotionType = 'regular',
  promotionDiscount = 0,
}) => ({
  productId,
  name,
  price,
  quantity,
  unitCost,
  promotionType,
  promotionDiscount,
});

test('calculates realized gross margin after item promotion, coupon allocation and cost snapshot', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'order-1',
      subtotal: 90,
      total: 'R$ 81,00',
      couponCode: 'BEMVINDO',
      couponDiscountAmount: 9,
      items: [
        item({ productId: 'milk', name: 'Leite', price: 'R$ 10,00', quantity: 3, unitCost: 8, promotionType: 'flash_offer', promotionDiscount: 6 }),
        item({ productId: 'rice', name: 'Arroz', price: 'R$ 60,00', unitCost: 55 }),
      ],
    })],
    campaigns: [{ id: 'campaign-1', code: 'BEMVINDO', discountPercent: 10, _count: { recipients: 20 } }],
    now: new Date('2026-10-02T12:00:00.000Z'),
  });

  assert.equal(metrics.totals.revenue, 81);
  assert.equal(metrics.totals.costOfGoodsSold, 79);
  assert.equal(metrics.totals.grossProfit, 2);
  assert.equal(metrics.totals.grossMargin, 2.47);
  assert.equal(metrics.totals.discounts, 15);
  assert.equal(metrics.promotionTypes.find((promotion) => promotion.key === 'flash_offer').revenue, 27);
  assert.equal(metrics.coupons[0].discount, 9);
  assert.equal(metrics.coverage.costCoveragePercent, 100);
  assert.equal(metrics.discountCombinations[0].key, 'flash_offer+coupon');
  assert.equal(metrics.discountCombinations[0].itemPromotionDiscount, 6);
  assert.equal(metrics.discountCombinations[0].couponDiscount, 9);
  assert.equal(metrics.discountCombinations[0].totalDiscount, 15);
  assert.equal(metrics.discountCombinations[0].revenue, 81);
  assert.equal(metrics.discountCombinations[0].grossProfit, 2);
  assert.equal(metrics.bestSellingDiscount.orders, 1);
  assert.deepEqual(
    metrics.discountOrders[0].discountBreakdown.map(({ label, amount }) => [label, amount]),
    [['Oferta relâmpago', 6], ['Cupom BEMVINDO', 9]],
  );
  assert.equal(metrics.discountOrders[0].netRevenue, 81);
  assert.equal(metrics.discountOrders[0].totalDiscount, 15);
  assert.equal(metrics.discountOrders[0].grossProfit, 2);
});

test('tracks multiple item promotions stacked with a coupon and reports the final order result', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'stacked-discounts',
      subtotal: 130,
      total: 'R$ 117,00',
      couponCode: 'COMBINA10',
      couponDiscountAmount: 13,
      items: [
        item({ productId: 'milk', name: 'Leite', price: 'R$ 40,00', quantity: 2, unitCost: 15, promotionType: 'flash_offer', promotionDiscount: 20 }),
        item({ productId: 'rice', name: 'Arroz', price: 'R$ 50,00', unitCost: 20, promotionType: 'catalog_discount', promotionDiscount: 10 }),
      ],
    })],
  });

  const combination = metrics.discountCombinations[0];
  const trackedOrder = metrics.discountOrders[0];
  assert.equal(combination.key, 'flash_offer+catalog_discount+coupon');
  assert.equal(combination.orders, 1);
  assert.equal(combination.itemPromotionDiscount, 30);
  assert.equal(combination.couponDiscount, 13);
  assert.equal(combination.totalDiscount, 43);
  assert.equal(combination.revenue, 117);
  assert.equal(combination.costOfGoodsSold, 50);
  assert.equal(combination.grossProfit, 67);
  assert.equal(metrics.bestSellingDiscount.key, combination.key);
  assert.equal(trackedOrder.subtotal, 130);
  assert.equal(trackedOrder.netRevenue, 117);
  assert.equal(trackedOrder.grossMargin, 57.26);
  assert.deepEqual(
    trackedOrder.discountBreakdown.map(({ label, amount }) => [label, amount]),
    [['Oferta relâmpago', 20], ['Desconto de catálogo', 10], ['Cupom COMBINA10', 13]],
  );
});

test('ranks discount combinations by number of orders before revenue', () => {
  const metrics = buildFinancialMetrics({
    orders: [
      order({
        id: 'higher-revenue',
        subtotal: 1000,
        total: 'R$ 950,00',
        couponCode: 'FLASH10',
        couponDiscountAmount: 50,
        items: [item({ productId: 'tv', name: 'Televisão', price: 'R$ 1.000,00', unitCost: 100, promotionType: 'flash_offer', promotionDiscount: 100 })],
      }),
      ...['popular-1', 'popular-2'].map((id) => order({
        id,
        subtotal: 20,
        total: 'R$ 18,00',
        couponCode: 'POPULAR10',
        couponDiscountAmount: 2,
        items: [item({ productId: 'bread', name: 'Pão', price: 'R$ 20,00', unitCost: 10, promotionType: 'catalog_price', promotionDiscount: 5 })],
      })),
    ],
  });

  assert.equal(metrics.bestSellingDiscount.key, 'catalog_price+coupon');
  assert.equal(metrics.bestSellingDiscount.orders, 2);
});

test('does not report an overall margin when any sold line lacks a cost snapshot', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'order-2',
      subtotal: 20,
      total: 'R$ 20,00',
      items: [item({ productId: 'bread', name: 'Pão', price: 'R$ 20,00', unitCost: null })],
    })],
  });

  assert.equal(metrics.totals.revenue, 20);
  assert.equal(metrics.totals.costOfGoodsSold, null);
  assert.equal(metrics.totals.grossProfit, null);
  assert.equal(metrics.totals.grossMargin, null);
  assert.equal(metrics.coverage.missingCostItems, 1);
});

test('withholds margin when order totals cannot be reconciled to item revenue', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'order-unreconciled',
      subtotal: 50,
      total: 'R$ 50,00',
      items: [item({ productId: 'bread', name: 'Pão', price: 'R$ 60,00', unitCost: 30 })],
    })],
  });

  assert.equal(metrics.totals.grossProfit, null);
  assert.equal(metrics.totals.grossMargin, null);
  assert.equal(metrics.coverage.unreconciledOrders, 1);
});

test('marks historic items with no promotion snapshot as unclassified', () => {
  const legacyItem = item({ productId: 'legacy', name: 'Produto legado', price: 'R$ 10,00', unitCost: 5 });
  delete legacyItem.promotionType;

  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'order-legacy',
      subtotal: 10,
      total: 'R$ 10,00',
      items: [legacyItem],
    })],
  });

  assert.equal(metrics.coverage.promotionCoveragePercent, 0);
  assert.equal(metrics.promotionTypes[0].key, 'unclassified');
  assert.equal(metrics.bestSellingPromotion, null);
});

test('labels low or negative-margin products with co-purchased basket items as candidates, not causal proof', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'order-3',
      subtotal: 15,
      total: 'R$ 15,00',
      items: [
        item({ productId: 'milk', name: 'Leite', price: 'R$ 5,00', unitCost: 6 }),
        item({ productId: 'bread', name: 'Pão', price: 'R$ 10,00', unitCost: 5 }),
      ],
    })],
  });

  assert.equal(metrics.lossLeaders.length, 1);
  assert.equal(metrics.lossLeaders[0].title, 'Leite');
  assert.equal(metrics.lossLeaders[0].grossProfit, -1);
  assert.equal(metrics.lossLeaders[0].attachRate, 100);
  assert.equal(metrics.lossLeaders[0].associatedRevenue, 10);
  assert.equal(metrics.lossLeaders[0].coProducts[0].title, 'Pão');
});

test('attributes coupon use to first recorded purchase or returning customers using history outside the selected period', () => {
  const metrics = buildFinancialMetrics({
    startDate: '2026-10-02',
    endDate: '2026-10-02',
    orders: [
      order({
        id: 'prior',
        createdAt: '2026-10-01T15:00:00.000Z',
        customerEmail: 'repetido@example.com',
        subtotal: 40,
        total: 'R$ 40,00',
        items: [item({ productId: 'rice', name: 'Arroz', price: 'R$ 40,00', unitCost: 20 })],
      }),
      order({
        id: 'coupon-returning',
        createdAt: '2026-10-02T13:00:00.000Z',
        customerEmail: 'repetido@example.com',
        subtotal: 60,
        total: 'R$ 54,00',
        couponCode: 'CLIENTE10',
        couponDiscountAmount: 6,
        items: [item({ productId: 'coffee', name: 'Café', price: 'R$ 60,00', unitCost: 30 })],
      }),
      order({
        id: 'coupon-new',
        createdAt: '2026-10-02T14:00:00.000Z',
        customerEmail: 'novo@example.com',
        subtotal: 90,
        total: 'R$ 81,00',
        couponCode: 'CLIENTE10',
        couponDiscountAmount: 9,
        items: [item({ productId: 'milk', name: 'Leite', price: 'R$ 90,00', unitCost: 45 })],
      }),
    ],
    campaigns: [{ id: 'campaign-2', code: 'CLIENTE10', discountPercent: 10, _count: { recipients: 2 } }],
    now: new Date('2026-10-03T12:00:00.000Z'),
  });

  assert.equal(metrics.period.orders, 2);
  assert.equal(metrics.coupons[0].orders, 2);
  assert.equal(metrics.coupons[0].newCustomers, 1);
  assert.equal(metrics.coupons[0].returningCustomers, 1);
  assert.equal(metrics.couponSummary.newCustomers, 1);
  assert.equal(metrics.couponSummary.returningCustomers, 1);
  assert.equal(metrics.couponSummary.discount, 15);
});

test('keeps cancelled orders out of historical revenue and customer cohorts', () => {
  const metrics = buildFinancialMetrics({
    orders: [order({
      id: 'cancelled',
      customerEmail: 'cliente@example.com',
      total: 'R$ 500,00',
      status: 'Cancelado',
      items: [item({ productId: 'x', name: 'Produto', price: 'R$ 500,00', unitCost: 10 })],
    })],
  });

  assert.equal(metrics.period.orders, 0);
  assert.equal(metrics.totals.revenue, 0);
  assert.equal(metrics.period.firstOrderDate, null);
});
