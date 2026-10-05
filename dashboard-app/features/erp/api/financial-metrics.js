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

const discountTypeLabels = {
  flash_offer: promotionLabels.flash_offer,
  catalog_price: promotionLabels.catalog_price,
  catalog_discount: promotionLabels.catalog_discount,
  coupon: 'Cupom',
  other: 'Outro desconto de item',
  unclassified_order_discount: 'Desconto no pedido não identificado',
  unclassified: 'Desconto não rastreado',
  no_discount: 'Sem desconto registrado',
};

const discountTypeOrder = [
  'flash_offer',
  'catalog_price',
  'catalog_discount',
  'coupon',
  'other',
  'unclassified_order_discount',
  'unclassified',
  'no_discount',
];

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

function getItemDiscountType(line) {
  if (line.promotionKey === 'unclassified') return 'unclassified';
  if (line.promotionKey === 'regular') return line.promotionDiscount > 0 ? 'other' : null;
  return line.promotionKey;
}

function getOrderDiscountTypes(lines, couponCode, orderDiscount) {
  const types = new Set();
  lines.forEach((line) => {
    const type = getItemDiscountType(line);
    if (type) types.add(type);
  });
  if (couponCode) types.add('coupon');
  else if (orderDiscount > 0) types.add('unclassified_order_discount');
  if (!types.size) types.add('no_discount');

  return [...types].sort((first, second) => discountTypeOrder.indexOf(first) - discountTypeOrder.indexOf(second));
}

function getDiscountBreakdown(lines, couponCode, orderDiscount) {
  const breakdown = new Map();
  const addDiscount = (key, label, amount) => {
    const existing = breakdown.get(key) || { key, label, amount: 0 };
    existing.amount += amount;
    breakdown.set(key, existing);
  };

  lines.forEach((line) => {
    const key = getItemDiscountType(line);
    if (key) addDiscount(key, discountTypeLabels[key] || discountTypeLabels.other, line.promotionDiscount);
  });
  if (couponCode) {
    addDiscount('coupon', `Cupom ${couponCode}`, orderDiscount);
  } else if (orderDiscount > 0) {
    addDiscount('unclassified_order_discount', discountTypeLabels.unclassified_order_discount, orderDiscount);
  }

  return [...breakdown.values()].map((discount) => ({
    ...discount,
    amount: roundMoney(discount.amount),
  }));
}

function createDiscountCombinationAccumulator(key, discountTypes) {
  return {
    key,
    discountTypes,
    label: discountTypes.map((type) => discountTypeLabels[type] || discountTypeLabels.other).join(' + '),
    orderIds: new Set(),
    itemCount: 0,
    quantity: 0,
    revenue: 0,
    itemPromotionDiscount: 0,
    couponDiscount: 0,
    otherOrderDiscount: 0,
    totalDiscount: 0,
    cost: 0,
    missingCostItems: 0,
    ordersWithoutItems: 0,
    invalidOrders: 0,
    unreconciledOrders: 0,
  };
}

function summarizeDiscountCombination(accumulator) {
  const orders = accumulator.orderIds.size;
  const costsComplete = orders > 0
    && accumulator.itemCount > 0
    && accumulator.missingCostItems === 0
    && accumulator.ordersWithoutItems === 0
    && accumulator.invalidOrders === 0
    && accumulator.unreconciledOrders === 0;
  const grossProfit = costsComplete ? accumulator.revenue - accumulator.cost : null;

  return {
    key: accumulator.key,
    discountTypes: accumulator.discountTypes,
    label: accumulator.label,
    orders,
    itemCount: accumulator.itemCount,
    quantity: Number(accumulator.quantity.toFixed(3)),
    itemPromotionDiscount: roundMoney(accumulator.itemPromotionDiscount),
    couponDiscount: roundMoney(accumulator.couponDiscount),
    otherOrderDiscount: roundMoney(accumulator.otherOrderDiscount),
    totalDiscount: roundMoney(accumulator.totalDiscount),
    revenue: roundMoney(accumulator.revenue),
    knownCostOfGoodsSold: roundMoney(accumulator.cost),
    costOfGoodsSold: costsComplete ? roundMoney(accumulator.cost) : null,
    grossProfit: grossProfit === null ? null : roundMoney(grossProfit),
    grossMargin: grossProfit === null || !accumulator.revenue
      ? null
      : Number((grossProfit / accumulator.revenue * 100).toFixed(2)),
    missingCostItems: accumulator.missingCostItems,
  };
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
    .filter((order) => order.status !== 'Cancelado'
      && !['pending', 'failed', 'canceled'].includes(String(order.paymentStatus || '').toLowerCase()))
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
  const discountCombinationStats = new Map();
  const candidateStats = new Map();
  const discountOrderReports = [];
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
    const refundedAmount = orderTotal === null
      ? 0
      : Math.min(orderTotal, Math.max(0, parseAmount(order.refundedAmount) || 0));
    const netOrderRevenue = orderTotal === null ? null : Math.max(0, orderTotal - refundedAmount);
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
    else revenue += netOrderRevenue;
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
      const lineRevenueBeforeRefund = Math.max(0, grossRevenue - lineCouponDiscount);
      const lineRevenue = orderTotal > 0
        ? lineRevenueBeforeRefund * (netOrderRevenue / orderTotal)
        : lineRevenueBeforeRefund;
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

    const orderItemPromotionDiscount = lines.reduce((sum, line) => sum + line.promotionDiscount, 0);
    const orderCost = lines.reduce((sum, line) => sum + line.cost, 0);
    const discountTypes = getOrderDiscountTypes(lines, couponCode, orderDiscount);
    const discountKey = discountTypes.join('+');
    const discountCombination = discountCombinationStats.get(discountKey)
      || createDiscountCombinationAccumulator(discountKey, discountTypes);
    discountCombination.orderIds.add(orderId);
    discountCombination.itemCount += lines.length;
    discountCombination.quantity += lines.reduce((sum, line) => sum + line.quantity, 0);
    discountCombination.revenue += netOrderRevenue || 0;
    discountCombination.itemPromotionDiscount += orderItemPromotionDiscount;
    discountCombination.couponDiscount += couponCode ? orderDiscount : 0;
    discountCombination.otherOrderDiscount += couponCode ? 0 : orderDiscount;
    discountCombination.totalDiscount += orderItemPromotionDiscount + orderDiscount;
    discountCombination.cost += orderCost;
    discountCombination.missingCostItems += lines.filter((line) => !line.costKnown).length;
    if (sourceItems.length === 0 && (orderTotal || 0) > 0) discountCombination.ordersWithoutItems += 1;
    if (orderTotal === null) discountCombination.invalidOrders += 1;
    if (sourceItems.length && !orderReconciled) discountCombination.unreconciledOrders += 1;
    discountCombinationStats.set(discountKey, discountCombination);

    const totalOrderDiscount = orderItemPromotionDiscount + orderDiscount;
    const hasDiscountTracking = totalOrderDiscount > 0
      || Boolean(couponCode)
      || discountTypes.some((type) => !['no_discount', 'unclassified'].includes(type));
    if (hasDiscountTracking) {
      const orderCostsComplete = lines.length > 0
        && orderTotal !== null
        && orderReconciled
        && lines.every((line) => line.valid && line.costKnown);
      const orderGrossProfit = orderCostsComplete ? netOrderRevenue - orderCost : null;
      discountOrderReports.push({
        id: orderId,
        createdAt: date.toISOString(),
        discountTypes,
        discountBreakdown: getDiscountBreakdown(lines, couponCode, orderDiscount),
        subtotal: roundMoney(orderSubtotal),
        itemPromotionDiscount: roundMoney(orderItemPromotionDiscount),
        couponDiscount: roundMoney(couponCode ? orderDiscount : 0),
        otherOrderDiscount: roundMoney(couponCode ? 0 : orderDiscount),
        totalDiscount: roundMoney(totalOrderDiscount),
        netRevenue: netOrderRevenue === null ? null : roundMoney(netOrderRevenue),
        knownCostOfGoodsSold: roundMoney(orderCost),
        costOfGoodsSold: orderCostsComplete ? roundMoney(orderCost) : null,
        grossProfit: orderGrossProfit === null ? null : roundMoney(orderGrossProfit),
        grossMargin: orderGrossProfit === null || !netOrderRevenue
          ? null
          : Number((orderGrossProfit / netOrderRevenue * 100).toFixed(2)),
      });
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
      coupon.revenue += netOrderRevenue || 0;
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
    const orderTotal = parseAmount(order.total) || 0;
    const refundedAmount = Math.min(orderTotal, Math.max(0, parseAmount(order.refundedAmount) || 0));
    entry.revenue += orderTotal - refundedAmount;
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
  const discountCombinations = [...discountCombinationStats.values()]
    .map(summarizeDiscountCombination)
    .sort((first, second) => second.orders - first.orders
      || second.quantity - first.quantity
      || second.revenue - first.revenue
      || first.label.localeCompare(second.label, 'pt-BR'));
  const bestSellingDiscount = discountCombinations.find((combination) => (
    combination.discountTypes.length > 0
    && combination.discountTypes.every((type) => !['no_discount', 'unclassified', 'unclassified_order_discount'].includes(type))
  )) || null;
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
    bestSellingDiscount: bestSellingDiscount
      ? {
        key: bestSellingDiscount.key,
        label: bestSellingDiscount.label,
        orders: bestSellingDiscount.orders,
        quantity: bestSellingDiscount.quantity,
        revenue: bestSellingDiscount.revenue,
      }
      : null,
    discountCombinations,
    discountOrders: discountOrderReports
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.id.localeCompare(first.id))
      .slice(0, 50),
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
