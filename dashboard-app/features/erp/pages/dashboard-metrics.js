function parseMoney(value) {
  const normalized = String(value ?? '')
    .replace(/[^0-9,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function parseOrderDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);

  const text = String(value);
  const localizedDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (localizedDate) {
    const date = new Date(Number(localizedDate[3]), Number(localizedDate[2]) - 1, Number(localizedDate[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseLotExpiryDate(value) {
  const text = String(value ?? '');
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return parseOrderDate(value);
}

function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

function makeDayDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function productIndex(products) {
  const byIdentity = new Map();
  const byTitle = new Map();
  products.forEach((product) => {
    [product.id, product.externalId].filter(Boolean).forEach((identity) => byIdentity.set(String(identity), product));
    const title = normalizeText(product.title);
    if (title) byTitle.set(title, product);
  });
  return { byIdentity, byTitle };
}

function findOrderProduct(item, indexes) {
  const identity = item.productId || item.productExternalId || item.id;
  if (identity && indexes.byIdentity.has(String(identity))) return indexes.byIdentity.get(String(identity));
  return indexes.byTitle.get(normalizeText(item.name || item.title));
}

export function deriveDashboardMetrics({ products = [], orders = [], customers = [], lots = [], now = new Date() } = {}) {
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const activeOrders = orders.filter((order) => normalizeText(order.status) !== 'cancelado');
  const monthOrders = activeOrders.filter((order) => {
    const date = parseOrderDate(order.createdAt);
    return date && date.getFullYear() === currentYear && date.getMonth() === currentMonth;
  });
  const monthlyRevenue = monthOrders.reduce((total, order) => total + parseMoney(order.total), 0);
  const indexes = productIndex(products);
  const monthlyItems = monthOrders.flatMap((order) => Array.isArray(order.items) ? order.items : []);
  let monthlyCost = 0;
  let hasCompleteCostData = monthlyItems.length > 0;

  monthlyItems.forEach((item) => {
    const product = findOrderProduct(item, indexes);
    const cost = parseMoney(product?.cost);
    const quantity = Number(item.quantity);
    if (!product || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
      hasCompleteCostData = false;
      return;
    }
    monthlyCost += cost * quantity;
  });

  const today = makeDayDate(now);
  const sevenDaysFromToday = addDays(today, 7);
  const thirtyDaysFromToday = addDays(today, 30);
  let expiredLotsCount = 0;
  let expiringLotsInSevenDaysCount = 0;
  let expiringLotsInThirtyDaysCount = 0;

  lots.forEach((lot) => {
    const quantity = Number(lot.quantity);
    const expiry = parseLotExpiryDate(lot.expiry);
    if (!Number.isFinite(quantity) || quantity <= 0 || !expiry) return;
    const expiryDay = makeDayDate(expiry);
    if (expiryDay < today) {
      expiredLotsCount += 1;
    } else if (expiryDay <= thirtyDaysFromToday) {
      expiringLotsInThirtyDaysCount += 1;
      if (expiryDay <= sevenDaysFromToday) expiringLotsInSevenDaysCount += 1;
    }
  });

  const activeProducts = products.filter((product) => normalizeText(product.status) === 'ativo');
  const averageMarginPercent = monthlyRevenue > 0 && hasCompleteCostData
    ? ((monthlyRevenue - monthlyCost) / monthlyRevenue) * 100
    : null;

  return {
    monthlyRevenue,
    monthOrderCount: monthOrders.length,
    averageTicket: monthOrders.length ? monthlyRevenue / monthOrders.length : null,
    averageMarginPercent,
    activeProductCount: activeProducts.length,
    activeCustomerCount: customers.filter((customer) => normalizeText(customer.status) === 'ativo').length,
    pendingOrderCount: activeOrders.filter((order) => normalizeText(order.status) === 'recebido').length,
    outOfStockProductCount: activeProducts.filter((product) => {
      const quantity = Number(product.quantity);
      return Number.isFinite(quantity) && quantity <= 0;
    }).length,
    expiredLotsCount,
    expiringLotsInSevenDaysCount,
    expiringLotsInThirtyDaysCount,
  };
}
