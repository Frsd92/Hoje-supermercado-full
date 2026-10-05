const saopauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const promotionLabels = {
  flash_offer: 'Oferta relâmpago',
  catalog_price: 'Preço promocional',
  catalog_discount: 'Desconto de catálogo',
  regular: 'Preço regular',
  unclassified: 'Não rastreado',
  other: 'Outro tipo',
};

function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;

  let normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function getDateKey(date) {
  const parts = Object.fromEntries(saopauloDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getCustomerKey(order) {
  const email = String(order.customerEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  const userId = String(order.userId || '').trim();
  return userId ? `user:${userId}` : '';
}

function getPromotionKey(item) {
  const value = String(item.promotionType || '').trim().toLowerCase();
  if (!value) return 'unclassified';
  return Object.hasOwn(promotionLabels, value) ? value : 'other';
}

function createLineAccumulator() {
  return {
    orderIds: new Set(),
    itemCount: 0,
    quantity: 0,
    revenue: 0,
    cost: 0,
    missingCostItems: 0,
    incompleteItems: 0,
    promotionDiscount: 0,
  };
}

function addLineToAccumulator(accumulator, order, line) {
  accumulator.orderIds.add(String(order.id || ''));
  accumulator.itemCount += 1;
  accumulator.quantity += line.quantity;
  accumulator.revenue += line.revenue;
  accumulator.promotionDiscount += line.promotionDiscount;
  if (line.costKnown) accumulator.cost += line.cost;
  else accumulator.missingCostItems += 1;
  if (!line.profitDataKnown) accumulator.incompleteItems += 1;
}

function summarizeLineAccumulator(accumulator) {
  const costsComplete = accumulator.itemCount > 0
    && accumulator.missingCostItems === 0
    && accumulator.incompleteItems === 0;
  const grossProfit = costsComplete ? accumulator.revenue - accumulator.cost : null;
  return {
    orders: accumulator.orderIds.size,
    itemCount: accumulator.itemCount,
    quantity: Number(accumulator.quantity.toFixed(3)),
    revenue: roundMoney(accumulator.revenue),
    promotionDiscount: roundMoney(accumulator.promotionDiscount),
    knownCost: roundMoney(accumulator.cost),
    costOfGoodsSold: costsComplete ? roundMoney(accumulator.cost) : null,
    grossProfit: grossProfit === null ? null : roundMoney(grossProfit),
    grossMargin: grossProfit === null || !accumulator.revenue
      ? null
      : Number((grossProfit / accumulator.revenue * 100).toFixed(2)),
    costCoverage: accumulator.itemCount
      ? Number(((accumulator.itemCount - accumulator.missingCostItems) / accumulator.itemCount * 100).toFixed(1))
      : null,
    missingCostItems: accumulator.missingCostItems,
  };
}

function createCouponAccumulator(campaign = null) {
  return {
    id: campaign?.id || null,
    code: String(campaign?.code || '').trim().toUpperCase(),
    campaignExists: Boolean(campaign),
    discountPercent: Number(campaign?.discountPercent) || null,
    recipients: Number(campaign?._count?.recipients ?? campaign?.recipientsCount) || 0,
    orderIds: new Set(),
    firstPurchaseCustomers: new Set(),
    returningCustomers: new Set(),
    revenue: 0,
    discount: 0,
    cost: 0,
    missingCostItems: 0,
    ordersWithoutItems: 0,
    invalidOrders: 0,
    unreconciledOrders: 0,
    itemCount: 0,
  };
}

function summarizeCouponAccumulator(accumulator) {
  const orders = accumulator.orderIds.size;
  const costsComplete = orders > 0
    && accumulator.itemCount > 0
    && accumulator.missingCostItems === 0
    && accumulator.ordersWithoutItems === 0
    && accumulator.invalidOrders === 0
    && accumulator.unreconciledOrders === 0;
  const grossProfit = costsComplete ? accumulator.revenue - accumulator.cost : null;
  return {
    id: accumulator.id,
    code: accumulator.code,
    campaignExists: accumulator.campaignExists,
    discountPercent: accumulator.discountPercent,
    recipients: accumulator.recipients,
    orders,
    newCustomers: accumulator.firstPurchaseCustomers.size,
    returningCustomers: accumulator.returningCustomers.size,
    revenue: roundMoney(accumulator.revenue),
    discount: roundMoney(accumulator.discount),
    grossProfit: grossProfit === null ? null : roundMoney(grossProfit),
    grossMargin: grossProfit === null || !accumulator.revenue
      ? null
      : Number((grossProfit / accumulator.revenue * 100).toFixed(2)),
  };
}

function formatTrendLabel(key, granularity) {
  const date = new Date(`${key}${granularity === 'month' ? '-01' : ''}T12:00:00Z`);
  return new Intl.DateTimeFormat('pt-BR', {
    ...(granularity === 'day' ? { day: '2-digit', month: 'short' } : { month: 'short', year: 'numeric' }),
    timeZone: 'UTC',
  }).format(date).replace('.', '');
}

export function buildFinancialMetrics({
  orders: sourceOrders,
  campaigns = [],
  startDate = '',
  endDate = '',
  now = new Date(),
}) {
  const allOrders = (Array.isArray(sourceOrders) ? sourceOrders : [])
    .filter((order) => order.status !== 'Cancelado')
    .map((order, index) => ({
      order,
      index,
      date: order.createdAt instanceof Date ? new Date(order.createdAt) : new Date(order.createdAt),
    }))
    .filter(({ date }) => Number.isFinite(date.getTime()))
    .sort((first, second) => (
      first.date - second.date
      || String(first.order.id || first.index).localeCompare(String(second.order.id || second.index))
    ));
  const inPeriod = allOrders.filter(({ date }) => {
    const key = getDateKey(date);
    return (!startDate || key >= startDate) && (!endDate || key <= endDate);
  });
  const promotionStats = new Map();
  const productStats = new Map();
  const couponStats = new Map();
  const candidateStats = new Map();
  const firstCustomerOrders = new Map();
  const firstPurchaseCustomersInPeriod = new Set();
  const returningCustomersInPeriod = new Set();
  const couponCustomersInPeriod = new Set();
  const overallOrderIds = new Set();
  const couponOrderIds = new Set();
  let revenue = 0;
  let knownCost = 0;
  let knownCostRevenue = 0;
  let totalDiscounts = 0;
  let couponDiscount = 0;
  let itemPromotionDiscount = 0;
  let totalItems = 0;
  let knownCostItems = 0;
  let missingCostItems = 0;
  let trackedPromotionItems = 0;
  let unclassifiedPromotionItems = 0;
  let ordersWithoutItems = 0;
  let invalidOrders = 0;
  let invalidItems = 0;
  let unreconciledOrders = 0;

  for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
    const code = String(campaign.code || '').trim().toUpperCase();
    if (code) couponStats.set(code, createCouponAccumulator(campaign));
  }

  for (const { order, date } of allOrders) {
    const orderId = String(order.id || '');
    const orderTotal = parseAmount(order.total);
    const sourceItems = Array.isArray(order.items) ? order.items : [];
    const rawLineTotal = sourceItems.reduce((sum, item) => {
      const price = parseAmount(item.price);
      const quantity = Number(item.quantity);
      return price !== null && Number.isFinite(quantity) && quantity > 0 ? sum + price * quantity : sum;
    }, 0);
    const storedSubtotal = parseAmount(order.subtotal);
    const orderSubtotal = storedSubtotal !== null && storedSubtotal > 0 ? storedSubtotal : rawLineTotal;
    const savedOrderDiscount = parseAmount(order.couponDiscountAmount) || 0;
    const discountFromTotals = orderTotal === null ? 0 : Math.max(0, orderSubtotal - orderTotal);
    const orderDiscount = Math.min(Math.max(0, orderSubtotal), Math.max(0, savedOrderDiscount, discountFromTotals));
    const allocationRatio = rawLineTotal > 0 ? Math.min(1, orderDiscount / rawLineTotal) : 0;
    const expectedLineRevenue = Math.max(0, rawLineTotal - Math.min(rawLineTotal, orderDiscount));
    const orderReconciled = orderTotal !== null
      && sourceItems.length > 0
      && Math.abs(expectedLineRevenue - orderTotal) <= 0.05;
    const inSelectedPeriod = (!startDate || getDateKey(date) >= startDate)
      && (!endDate || getDateKey(date) <= endDate);
    const couponCode = String(order.couponCode || '').trim().toUpperCase();
    const customerKey = getCustomerKey(order);
    const hadPriorPurchase = customerKey ? firstCustomerOrders.has(customerKey) : null;
    if (customerKey && !firstCustomerOrders.has(customerKey)) firstCustomerOrders.set(customerKey, date);

    if (!inSelectedPeriod) continue;

    overallOrderIds.add(orderId);
    if (orderTotal === null) invalidOrders += 1;
    else revenue += orderTotal;
    if (sourceItems.length === 0 && (orderTotal || 0) > 0) ordersWithoutItems += 1;
    const couponDiscountForOrder = couponCode ? orderDiscount : 0;
    couponDiscount += couponDiscountForOrder;
    totalDiscounts += orderDiscount;

    const lines = sourceItems.map((item) => {
      const quantity = Number(item.quantity);
      const unitPrice = parseAmount(item.price);
      const valid = Number.isFinite(quantity) && quantity > 0 && unitPrice !== null && unitPrice >= 0;
      if (!valid) invalidItems += 1;
      const safeQuantity = valid ? quantity : 0;
      const grossRevenue = valid ? unitPrice * safeQuantity : 0;
      const lineCouponDiscount = rawLineTotal > 0 ? grossRevenue * allocationRatio : 0;
      const lineRevenue = Math.max(0, grossRevenue - lineCouponDiscount);
      const unitCost = parseAmount(item.unitCost);
      const costKnown = valid && unitCost !== null && unitCost > 0;
      const cost = costKnown ? unitCost * safeQuantity : 0;
      const rawPromotionDiscount = parseAmount(item.promotionDiscount);
      const promotionDiscount = Math.max(0, rawPromotionDiscount || 0);
      const promotionKey = getPromotionKey(item);
      const productKey = String(item.productId || item.name || 'unknown').trim().toLowerCase();
      totalItems += 1;
      if (costKnown) {
        knownCostItems += 1;
        knownCost += cost;
        knownCostRevenue += lineRevenue;
      } else {
        missingCostItems += 1;
      }
      if (promotionKey === 'unclassified') unclassifiedPromotionItems += 1;
      else trackedPromotionItems += 1;
      itemPromotionDiscount += promotionDiscount;
      totalDiscounts += promotionDiscount;

      const line = {
        item,
        valid,
        profitDataKnown: valid && orderReconciled,
        quantity: safeQuantity,
        revenue: lineRevenue,
        cost,
        costKnown,
        promotionDiscount,
        promotionKey,
        productKey,
      };

      const promotionAccumulator = promotionStats.get(promotionKey) || createLineAccumulator();
      addLineToAccumulator(promotionAccumulator, order, line);
      promotionStats.set(promotionKey, promotionAccumulator);

      const productAccumulator = productStats.get(productKey) || {
        ...createLineAccumulator(),
        title: String(item.name || 'Produto sem nome'),
        productId: item.productId || null,
      };
      addLineToAccumulator(productAccumulator, order, line);
      productStats.set(productKey, productAccumulator);
      return line;
    });

    if (sourceItems.length && !orderReconciled) {
      unreconciledOrders += 1;
    }

    const basket = new Map();
    lines.forEach((line) => {
      const entry = basket.get(line.productKey) || {
        title: String(line.item.name || 'Produto sem nome'),
        revenue: 0,
        cost: 0,
        quantity: 0,
        missingCostItems: 0,
        incompleteItems: 0,
      };
      entry.revenue += line.revenue;
      entry.quantity += line.quantity;
      if (line.costKnown) entry.cost += line.cost;
      else entry.missingCostItems += 1;
      if (!line.profitDataKnown) entry.incompleteItems += 1;
      basket.set(line.productKey, entry);
    });
    basket.forEach((entry, productKey) => {
      const candidate = candidateStats.get(productKey) || {
        title: entry.title,
        orderIds: new Set(),
        attachedOrderIds: new Set(),
        revenue: 0,
        cost: 0,
        quantity: 0,
        missingCostItems: 0,
        incompleteItems: 0,
        associatedRevenue: 0,
        coProducts: new Map(),
      };
      candidate.orderIds.add(orderId);
      candidate.revenue += entry.revenue;
      candidate.cost += entry.cost;
      candidate.quantity += entry.quantity;
      candidate.missingCostItems += entry.missingCostItems;
      candidate.incompleteItems += entry.incompleteItems;
      const coProducts = [...basket.entries()].filter(([otherKey]) => otherKey !== productKey);
      if (coProducts.length) {
        candidate.attachedOrderIds.add(orderId);
        coProducts.forEach(([otherKey, other]) => {
          candidate.associatedRevenue += other.revenue;
          const coProduct = candidate.coProducts.get(otherKey) || {
            title: other.title,
            orders: new Set(),
            revenue: 0,
          };
          coProduct.orders.add(orderId);
          coProduct.revenue += other.revenue;
          candidate.coProducts.set(otherKey, coProduct);
        });
      }
      candidateStats.set(productKey, candidate);
    });

    if (couponCode) {
      const coupon = couponStats.get(couponCode) || createCouponAccumulator();
      coupon.id ||= `unregistered-${couponCode}`;
      coupon.code = couponCode;
      coupon.orderIds.add(orderId);
      coupon.revenue += orderTotal || 0;
      coupon.discount += orderDiscount;
      coupon.itemCount += lines.length;
      if (sourceItems.length === 0 && (orderTotal || 0) > 0) coupon.ordersWithoutItems += 1;
      if (orderTotal === null) coupon.invalidOrders += 1;
      if (sourceItems.length && !orderReconciled) coupon.unreconciledOrders += 1;
      lines.forEach((line) => {
        if (line.costKnown) coupon.cost += line.cost;
        else coupon.missingCostItems += 1;
      });
      if (customerKey) {
        couponCustomersInPeriod.add(customerKey);
        if (hadPriorPurchase) {
          coupon.returningCustomers.add(customerKey);
          returningCustomersInPeriod.add(customerKey);
        } else {
          coupon.firstPurchaseCustomers.add(customerKey);
          firstPurchaseCustomersInPeriod.add(customerKey);
        }
      }
      couponStats.set(couponCode, coupon);
      couponOrderIds.add(orderId);
    }
  }

  const dateSpanStart = startDate || (inPeriod.length ? getDateKey(inPeriod[0].date) : getDateKey(now));
  const dateSpanEnd = endDate || getDateKey(now);
  const spanDays = Math.max(0, (Date.parse(`${dateSpanEnd}T00:00:00Z`) - Date.parse(`${dateSpanStart}T00:00:00Z`)) / 86400000);
  const trendGranularity = spanDays <= 90 ? 'day' : 'month';
  const formattedTrend = new Map();
  for (const { order, date } of inPeriod) {
    const key = trendGranularity === 'day' ? getDateKey(date) : getDateKey(date).slice(0, 7);
    const entry = formattedTrend.get(key) || { revenue: 0, orders: 0 };
    entry.revenue += parseAmount(order.total) || 0;
    entry.orders += 1;
    formattedTrend.set(key, entry);
  }
  const trend = [...formattedTrend.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([key, value]) => ({
    key,
    label: formatTrendLabel(key, trendGranularity),
    revenue: roundMoney(value.revenue),
    orders: value.orders,
  }));

  const lineItems = [...productStats.values()];
  const allCostsComplete = totalItems > 0
    && missingCostItems === 0
    && ordersWithoutItems === 0
    && invalidOrders === 0
    && invalidItems === 0
    && unreconciledOrders === 0;
  const grossProfit = allCostsComplete && overallOrderIds.size > 0 ? revenue - knownCost : null;
  const promotionTypes = [...promotionStats.entries()]
    .map(([key, accumulator]) => ({ key, label: promotionLabels[key] || promotionLabels.other, ...summarizeLineAccumulator(accumulator) }))
    .sort((first, second) => second.revenue - first.revenue || first.label.localeCompare(second.label, 'pt-BR'));
  const promotionLeaders = promotionTypes.filter((item) => (
    ['flash_offer', 'catalog_price', 'catalog_discount', 'other'].includes(item.key)
  ));
  const bestSellingPromotion = promotionLeaders[0] || null;
  const products = lineItems
    .map((accumulator) => ({
      productId: accumulator.productId,
      title: accumulator.title,
      ...summarizeLineAccumulator(accumulator),
    }))
    .sort((first, second) => second.revenue - first.revenue)
    .slice(0, 30);
  const lossLeaders = [...candidateStats.entries()]
    .filter(([, candidate]) => (
      candidate.missingCostItems === 0
      && candidate.orderIds.size > 0
      && candidate.attachedOrderIds.size > 0
      && candidate.incompleteItems === 0
      && candidate.revenue - candidate.cost <= 0
    ))
    .map(([productKey, candidate]) => ({
      id: productKey,
      title: candidate.title,
      orders: candidate.orderIds.size,
      quantity: Number(candidate.quantity.toFixed(3)),
      revenue: roundMoney(candidate.revenue),
      grossProfit: roundMoney(candidate.revenue - candidate.cost),
      grossMargin: candidate.revenue
        ? Number(((candidate.revenue - candidate.cost) / candidate.revenue * 100).toFixed(2))
        : null,
      attachRate: Number((candidate.attachedOrderIds.size / candidate.orderIds.size * 100).toFixed(1)),
      attachedOrders: candidate.attachedOrderIds.size,
      associatedRevenue: roundMoney(candidate.associatedRevenue),
      coProducts: [...candidate.coProducts.values()]
        .map((coProduct) => ({ title: coProduct.title, orders: coProduct.orders.size, revenue: roundMoney(coProduct.revenue) }))
        .sort((first, second) => second.revenue - first.revenue)
        .slice(0, 3),
    }))
    .sort((first, second) => first.grossProfit - second.grossProfit || second.attachRate - first.attachRate)
    .slice(0, 10);
  const coupons = [...couponStats.values()]
    .map(summarizeCouponAccumulator)
    .sort((first, second) => second.revenue - first.revenue || first.code.localeCompare(second.code));
  const redeemedCoupons = coupons.filter((coupon) => coupon.orders > 0);
  const couponRevenue = redeemedCoupons.reduce((sum, coupon) => sum + coupon.revenue, 0);
  const couponGrossProfitAvailable = redeemedCoupons.length > 0 && redeemedCoupons.every((coupon) => coupon.grossProfit !== null);
  const couponGrossProfit = couponGrossProfitAvailable
    ? roundMoney(redeemedCoupons.reduce((sum, coupon) => sum + coupon.grossProfit, 0))
    : null;
  const historyStart = allOrders[0]?.date || null;
  const historyEnd = allOrders.at(-1)?.date || null;

  return {
    generatedAt: now.toISOString(),
    period: {
      startDate,
      endDate,
      allHistory: !startDate && !endDate,
      firstOrderDate: historyStart?.toISOString() || null,
      lastOrderDate: historyEnd?.toISOString() || null,
      totalAvailableOrders: allOrders.length,
      orders: overallOrderIds.size,
    },
    totals: {
      revenue: roundMoney(revenue),
      orders: overallOrderIds.size,
      averageTicket: overallOrderIds.size ? roundMoney(revenue / overallOrderIds.size) : 0,
      items: totalItems,
      discounts: roundMoney(totalDiscounts),
      itemPromotionDiscounts: roundMoney(itemPromotionDiscount),
      couponDiscounts: roundMoney(couponDiscount),
      knownCostOfGoodsSold: roundMoney(knownCost),
      costOfGoodsSold: allCostsComplete && overallOrderIds.size ? roundMoney(knownCost) : null,
      grossProfit: grossProfit === null ? null : roundMoney(grossProfit),
      grossMargin: grossProfit === null || !revenue ? null : Number((grossProfit / revenue * 100).toFixed(2)),
      marginAvailable: allCostsComplete && overallOrderIds.size > 0,
    },
    coverage: {
      knownCostItems,
      missingCostItems,
      costCoveragePercent: totalItems ? Number((knownCostItems / totalItems * 100).toFixed(1)) : null,
      costRevenueCoveragePercent: revenue ? Number((knownCostRevenue / revenue * 100).toFixed(1)) : null,
      trackedPromotionItems,
      unclassifiedPromotionItems,
      promotionCoveragePercent: totalItems ? Number((trackedPromotionItems / totalItems * 100).toFixed(1)) : null,
      ordersWithoutItems,
      invalidOrders,
      invalidItems,
      unreconciledOrders,
    },
    trendGranularity,
    trend,
    bestSellingPromotion: bestSellingPromotion
      ? { key: bestSellingPromotion.key, label: bestSellingPromotion.label, revenue: bestSellingPromotion.revenue, orders: bestSellingPromotion.orders, quantity: bestSellingPromotion.quantity }
      : null,
    promotionTypes,
    lossLeaders,
    products,
    coupons,
    couponSummary: {
      orders: couponOrderIds.size,
      customers: couponCustomersInPeriod.size,
      newCustomers: firstPurchaseCustomersInPeriod.size,
      returningCustomers: returningCustomersInPeriod.size,
      discount: roundMoney(couponDiscount),
      revenue: roundMoney(couponRevenue),
      grossProfit: couponGrossProfit,
    },
  };
}
