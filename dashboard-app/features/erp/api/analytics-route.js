import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { getDeliveryLocation } from '@/lib/delivery-location';
import { prisma } from '@/lib/prisma';
import { buildInvoiceCpfAnalytics } from './invoice-cpf-analytics.js';
import { summarizeProfitability } from './analytics-metrics.js';
import { abandonedCartIdleThresholdHours, summarizeAbandonedCarts } from './abandoned-carts.js';
import { getFlashOfferStatus } from './product-pricing.js';

const ageGroups = [
  { label: 'Até 17 anos', min: 0, max: 17 },
  { label: '18–24 anos', min: 18, max: 24 },
  { label: '25–34 anos', min: 25, max: 34 },
  { label: '35–44 anos', min: 35, max: 44 },
  { label: '45–54 anos', min: 45, max: 54 },
  { label: '55–64 anos', min: 55, max: 64 },
  { label: '65 anos ou mais', min: 65, max: Infinity },
];

const money = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;
const parseDate = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)) : new Date(value);
};
const dateParts = (date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
}).formatToParts(date).map(({ type, value }) => [type, value]));
const dateKey = (date) => {
  const parts = dateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const labelDate = (date) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
}).format(date);
const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const weekdayIndexes = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function addToMap(map, key, value) { map.set(key, (map.get(key) || 0) + value); }
function seriesFromMap(map) { return [...map.entries()].map(([label, value]) => ({ label, value })); }
function startOfSaoPauloDay(date) {
  const parts = dateParts(date);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 3));
}
function startOfSaoPauloMonth(date, monthOffset = 0) {
  const parts = dateParts(date);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1 + monthOffset, 1, 3));
}
function geographicRanking(orders, getKey) {
  const groups = new Map();
  orders.forEach((order) => {
    const location = getDeliveryLocation(order);
    const key = getKey(location);
    if (!key) return;
    const current = groups.get(key) || { label: key, orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += money(order.total);
    groups.set(key, current);
  });
  return [...groups.values()].sort((first, second) => second.orders - first.orders || second.revenue - first.revenue || first.label.localeCompare(second.label, 'pt-BR')).slice(0, 10);
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const now = new Date();
  const cartActivityCutoff = new Date(now.getTime() - abandonedCartIdleThresholdHours * 60 * 60 * 1000);
  let ordersValue;
  let productsValue;
  let customerProfiles;
  let customerCarts;
  let guestCarts;
  let addressBooks;
  let couponCampaigns;
  try {
    [ordersValue, productsValue, customerProfiles, customerCarts, guestCarts, addressBooks, couponCampaigns] = await Promise.all([
      prisma.order.findMany({
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.findMany({
        include: { inventoryLots: { select: { id: true, lotCode: true, quantity: true, expiry: true } } },
      }),
      prisma.customerProfile.findMany({
        select: { email: true, fullName: true, gender: true, birthDate: true },
      }),
      prisma.customerCart.findMany({
        where: { updatedAt: { lte: cartActivityCutoff } },
        select: { email: true, items: true, updatedAt: true },
      }),
      prisma.guestCart.findMany({
        where: { updatedAt: { lte: cartActivityCutoff } },
        select: { items: true, updatedAt: true },
      }),
      prisma.customerAddressBook.findMany({
        select: { email: true, addresses: true },
      }),
      prisma.couponCampaign.findMany({
        include: { _count: { select: { recipients: true, redemptions: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
  } catch (error) {
    console.error('Não foi possível carregar as fontes de Analytics do banco de dados:', error);
    return Response.json({ error: 'Não foi possível carregar os indicadores agora. Tente novamente.' }, { status: 503 });
  }
  if ([...customerCarts, ...guestCarts].some((cart) => !Array.isArray(cart.items))) {
    console.error('Um carrinho armazenado no banco possui formato inválido.');
    return Response.json({ error: 'Não foi possível calcular os indicadores de carrinho.' }, { status: 503 });
  }

  const orders = ordersValue
    .filter((order) => order.status !== 'Cancelado')
    .map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity),
        unitCost: item.unitCost === null ? null : Number(item.unitCost),
        promotionDiscount: Number(item.promotionDiscount),
        product: item.product
          ? {
            ...item.product,
            price: Number(item.product.price),
            cost: Number(item.product.cost),
            discount: Number(item.product.discount),
          }
          : null,
      })),
    }));
  const products = productsValue.map((product) => {
    const metadata = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
      ? product.metadata
      : {};
    const inventoryLots = product.inventoryLots.map((lot) => ({
      ...lot,
      quantity: Number(lot.quantity),
    }));
    return {
      ...metadata,
      id: product.id,
      externalId: product.externalId,
      title: product.title,
      price: Number(product.price),
      cost: Number(product.cost),
      discount: Number(product.discount),
      quantity: Number(product.quantity),
      categories: product.categories,
      brand: product.brand,
      status: product.status,
      expiry: product.expiry,
      minStock: Number(metadata.minStock) || 0,
      saleUnit: metadata.saleUnit || null,
      inventoryLots,
    };
  });
  const unlocatedOrders = orders.filter((order) => {
    const location = getDeliveryLocation(order);
    return !location.state && !location.municipality && !location.neighborhood;
  }).length;
  const geography = {
    totalOrders: orders.length,
    unlocatedOrders,
    states: geographicRanking(orders, ({ state }) => state),
    municipalities: geographicRanking(orders, ({ municipality, state }) => municipality ? `${municipality}${state ? ` - ${state}` : ''}` : ''),
    neighborhoods: geographicRanking(orders, ({ neighborhood, municipality, state }) => neighborhood
      ? `${neighborhood}${municipality ? ` · ${municipality}` : ''}${state ? ` - ${state}` : ''}`
      : ''),
  };
  const profilesByEmail = new Map(customerProfiles.map((profile) => [profile.email.trim().toLowerCase(), profile]));
  const customerOrdersForInsights = new Map();
  orders.forEach((order) => {
    const email = String(order.customerEmail || '').trim().toLowerCase();
    if (!email.includes('@')) return;
    const list = customerOrdersForInsights.get(email) || [];
    list.push(order);
    customerOrdersForInsights.set(email, list);
  });
  const genderGroups = new Map([
    ['masculino', { label: 'Masculino', customers: 0, orders: 0, revenue: 0 }],
    ['feminino', { label: 'Feminino', customers: 0, orders: 0, revenue: 0 }],
  ]);
  const ageGroupStats = new Map(ageGroups.map(({ label }) => [label, { label, customers: 0, orders: 0, revenue: 0 }]));
  let customersWithGender = 0;
  let customersWithBirthDate = 0;
  const getAge = (birthDate) => {
    if (!birthDate) return null;
    const birthYear = birthDate.getUTCFullYear();
    const birthMonth = birthDate.getUTCMonth();
    const birthDay = birthDate.getUTCDate();
    const today = dateParts(now);
    let age = Number(today.year) - birthYear;
    if (Number(today.month) - 1 < birthMonth || (Number(today.month) - 1 === birthMonth && Number(today.day) < birthDay)) age -= 1;
    return age >= 0 ? age : null;
  };
  customerOrdersForInsights.forEach((customerOrdersForEmail, email) => {
    const profile = profilesByEmail.get(email);
    const profileGender = String(profile?.gender || '').trim().toLowerCase();
    const normalizedGender = ({ homem: 'masculino', mulher: 'feminino' })[profileGender] || profileGender;
    const gender = genderGroups.get(normalizedGender);
    const customerRevenue = customerOrdersForEmail.reduce((sum, order) => sum + money(order.total), 0);
    if (gender) {
      customersWithGender += 1;
      gender.customers += 1;
      gender.orders += customerOrdersForEmail.length;
      gender.revenue += customerRevenue;
    }
    const age = getAge(profile?.birthDate);
    if (age !== null) {
      customersWithBirthDate += 1;
      const group = ageGroups.find(({ min, max }) => age >= min && age <= max);
      const stats = group ? ageGroupStats.get(group.label) : null;
      if (stats) {
        stats.customers += 1;
        stats.orders += customerOrdersForEmail.length;
        stats.revenue += customerRevenue;
      }
    }
  });
  const abandonedCartAnalytics = summarizeAbandonedCarts({
    customerCarts,
    guestCarts,
    profilesByEmail,
    customerOrdersForInsights,
    now,
  });
  const productMap = new Map(products.map((product) => [String(product.title).trim().toLowerCase(), product]));
  const productMapById = new Map(products.map((product) => [product.id, product]));
  const lineItems = orders.flatMap((order) => (order.items || []).map((item) => {
    const product = productMapById.get(item.productId) || productMap.get(String(item.name || '').trim().toLowerCase());
    const quantity = Number(item.quantity) || 0;
    const itemSubtotal = money(item.price) * quantity;
    const orderSubtotal = Number(order.subtotal) || order.items.reduce((sum, orderItem) => sum + money(orderItem.price) * Number(orderItem.quantity), 0);
    const couponDiscount = Number(order.couponDiscountAmount)
      || Math.max(0, orderSubtotal - money(order.total));
    const revenueShare = orderSubtotal > 0 ? Math.max(0, (orderSubtotal - couponDiscount) / orderSubtotal) : 1;
    const revenue = itemSubtotal * revenueShare;
    const costKnown = item.unitCost !== null && Number.isFinite(Number(item.unitCost)) && Number(item.unitCost) > 0;
    const cost = costKnown ? Number(item.unitCost) * quantity : null;
    return {
      ...item,
      product,
      quantity,
      revenue,
      cost,
      costKnown,
      profit: costKnown ? revenue - cost : null,
      order,
    };
  }));
  const revenue = orders.reduce((sum, order) => sum + money(order.total), 0);
  const profitabilitySummary = summarizeProfitability({
    orders: orders.map((order) => ({ ...order, totalAmount: money(order.total) })),
    lineItems,
    revenue,
  });
  const { available: profitabilityAvailable, missingCostItems } = profitabilitySummary;
  const searchParams = new URL(request.url).searchParams;
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const validFilterDate = (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validFilterDate(startDate) || !validFilterDate(endDate) || (startDate && endDate && startDate > endDate)) {
    return Response.json({ error: 'O período informado é inválido.' }, { status: 400 });
  }
  const validDateOrders = orders.map((order) => ({ order, date: parseDate(order.createdAt) })).filter(({ date }) => !Number.isNaN(date.getTime()));
  const last30 = new Date(now); last30.setDate(now.getDate() - 30);
  const previous30 = new Date(now); previous30.setDate(now.getDate() - 60);
  const currentOrders = validDateOrders.filter(({ date }) => date >= last30);
  const previousOrders = validDateOrders.filter(({ date }) => date >= previous30 && date < last30);
  const sumOrders = (items) => items.reduce((sum, item) => sum + money(item.order.total), 0);
  const startOfToday = startOfSaoPauloDay(now);
  const todayParts = dateParts(now);
  const localWeekday = weekdayIndexes[todayParts.weekday];
  const startOfWeek = new Date(startOfToday.getTime() - ((localWeekday + 6) % 7) * 86400000);
  const startOfMonth = startOfSaoPauloMonth(now);
  const startOfPreviousWeek = new Date(startOfWeek); startOfPreviousWeek.setDate(startOfWeek.getDate() - 7);
  const startOfPreviousMonth = startOfSaoPauloMonth(now, -1);
  const endOfPreviousMonth = new Date(startOfMonth);
  const periodOrders = (start, end = now) => validDateOrders.filter(({ date }) => date >= start && date < end);
  const periodSummary = (items) => {
    const value = sumOrders(items);
    return { revenue: value, orders: items.length, averageTicket: items.length ? value / items.length : 0 };
  };
  const todaySummary = periodSummary(periodOrders(startOfToday));
  const weekSummary = periodSummary(periodOrders(startOfWeek));
  const monthSummary = periodSummary(periodOrders(startOfMonth));
  const previousWeekSummary = periodSummary(periodOrders(startOfPreviousWeek, startOfWeek));
  const previousMonthSummary = periodSummary(periodOrders(startOfPreviousMonth, endOfPreviousMonth));
  const filteredDateOrders = (startDate || endDate)
    ? validDateOrders.filter(({ date }) => {
      const key = dateKey(date);
      return (!startDate || key >= startDate) && (!endDate || key <= endDate);
    })
    : validDateOrders;
  const currentRevenue = sumOrders(currentOrders);
  const previousRevenue = sumOrders(previousOrders);
  const growth = previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

  const daily = new Map();
  const hourly = new Map();
  const weekdays = new Map(dayNames.map((name) => [name, 0]));
  filteredDateOrders.forEach(({ order, date }) => {
    const parts = dateParts(date);
    addToMap(daily, dateKey(date), money(order.total));
    addToMap(hourly, `${parts.hour}h`, money(order.total));
    addToMap(weekdays, dayNames[weekdayIndexes[parts.weekday]], money(order.total));
  });
  const dailySeries = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31).map(([key, value]) => ({ label: labelDate(new Date(`${key}T12:00:00`)), value }));
  const itemStats = new Map();
  const filteredOrderIds = new Set(filteredDateOrders.map(({ order }) => order.id));
  lineItems.filter((item) => (!(startDate || endDate) || filteredOrderIds.has(item.order.id))).forEach((item) => {
    const key = item.product?.title || item.name || 'Produto sem cadastro';
    const current = itemStats.get(key) || {
      title: key,
      quantity: 0,
      revenue: 0,
      cost: 0,
      missingCostItems: 0,
      unit: item.product?.saleUnit === 'Quilograma' || item.unit === 'kg' ? 'kg' : 'unidades',
      category: item.product?.categories?.[0] || 'Sem categoria',
      brand: item.product?.brand || 'Sem marca',
    };
    current.quantity += item.quantity;
    current.revenue += item.revenue;
    if (item.costKnown) current.cost += item.cost;
    else current.missingCostItems += 1;
    itemStats.set(key, current);
  });
  const productStats = [...itemStats.values()].map((item) => ({
    ...item,
    profit: item.missingCostItems ? null : item.revenue - item.cost,
    margin: item.missingCostItems || !item.revenue ? null : ((item.revenue - item.cost) / item.revenue) * 100,
  })).sort((a, b) => b.revenue - a.revenue);
  const paymentLabels = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro', nao_informado: 'Não informado' };
  const paymentStats = new Map();
  filteredDateOrders.forEach(({ order }) => {
    const method = String(order.paymentMethod || 'nao_informado').toLowerCase();
    const current = paymentStats.get(method) || { method, label: paymentLabels[method] || 'Não informado', orders: 0, value: 0 };
    current.orders += 1;
    current.value += money(order.total);
    paymentStats.set(method, current);
  });
  const ordersWithPaymentMethod = filteredDateOrders.filter(({ order }) => (
    ['pix', 'cartao', 'dinheiro', 'outro'].includes(String(order.paymentMethod || '').toLowerCase())
  )).length;
  const purchaseDetails = filteredDateOrders.map(({ order, date }) => ({
    id: order.id,
    date: order.createdAt,
    sortDate: date.getTime(),
    customer: order.customerName || order.customerEmail || 'Cliente não identificado',
    paymentMethod: String(order.paymentMethod || 'nao_informado').toLowerCase(),
    paymentLabel: paymentLabels[String(order.paymentMethod || 'nao_informado').toLowerCase()] || 'Não informado',
    value: money(order.total),
    items: (order.items || []).reduce((total, item) => total + (Number(item.quantity) || 0), 0),
  })).sort((first, second) => second.sortDate - first.sortDate);
  const categoryStats = new Map();
  const brandStats = new Map();
  lineItems.forEach((item) => {
    const category = item.product?.categories?.[0] || 'Sem categoria';
    const brand = item.product?.brand || 'Sem marca';
    [categoryStats, brandStats].forEach((groups, index) => {
      const label = index === 0 ? category : brand;
      const current = groups.get(label) || { label, revenue: 0, cost: 0, missingCostItems: 0 };
      current.revenue += item.revenue;
      if (item.costKnown) current.cost += item.cost;
      else current.missingCostItems += 1;
      groups.set(label, current);
    });
  });
  const businessDate = (value) => {
    const date = parseDate(value);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    return {
      date: new Date(Date.UTC(year, month, day, 12)),
      days: Math.round((Date.UTC(year, month, day, 3) - startOfToday.getTime()) / 86400000),
    };
  };
  const stock = products.filter((product) => product.status === 'Ativo').map((product) => {
    const hasLots = product.inventoryLots.length > 0;
    const positiveLots = product.inventoryLots.filter((lot) => lot.quantity > 0);
    const quantity = hasLots
      ? positiveLots.reduce((sum, lot) => sum + lot.quantity, 0)
      : Number(product.quantity) || 0;
    const lots = hasLots
      ? positiveLots.filter((lot) => lot.expiry).map((lot) => {
        const expiry = businessDate(lot.expiry);
        return expiry ? {
          id: lot.id,
          lotCode: lot.lotCode || 'Sem código',
          quantity: lot.quantity,
          ...expiry,
        } : null;
      }).filter(Boolean)
      : product.expiry
        ? (() => {
          const expiry = businessDate(product.expiry);
          return expiry ? [{ id: `${product.id}-legacy-expiry`, lotCode: 'Validade cadastrada no produto', quantity, ...expiry }] : [];
        })()
        : [];
    const nextExpiry = [...lots].sort((first, second) => first.days - second.days)[0] || null;
    const costKnown = Number(product.cost) > 0;
    return {
      id: product.id,
      title: product.title,
      hasLots,
      quantity,
      stockValue: costKnown ? quantity * Number(product.cost) : null,
      costKnown,
      minStock: Number(product.minStock) || 0,
      expiry: nextExpiry?.date || null,
      daysToExpiry: nextExpiry?.days ?? null,
      category: product.categories?.[0] || 'Sem categoria',
      lots,
    };
  });
  const stockById = new Map(stock.map((product) => [product.id, product]));
  const nearExpiryLots = stock.flatMap((product) => product.lots
    .filter((lot) => lot.days >= 0 && lot.days <= 30)
    .map((lot) => ({ ...lot, product: product.title })));
  const expiredLots = stock.flatMap((product) => product.lots
    .filter((lot) => lot.days < 0)
    .map((lot) => ({ ...lot, product: product.title })));
  const nearExpiry = stock.filter((product) => product.lots.some((lot) => lot.days >= 0 && lot.days <= 30));
  const outOfStock = stock.filter((product) => product.quantity <= 0);
  const lowStock = stock.filter((product) => product.minStock > 0 && product.quantity <= product.minStock);
  const uncostedStock = stock.filter((product) => product.quantity > 0 && !product.costKnown);
  const productsWithLots = stock.filter((product) => product.hasLots).length;
  const stockValueComplete = uncostedStock.length === 0;
  const stockValue = stock.reduce((sum, product) => sum + (product.stockValue || 0), 0);

  const customerOrders = new Map();
  orders.forEach((order) => {
    const email = String(order.customerEmail || '').trim().toLowerCase();
    if (!email.includes('@')) return;
    const list = customerOrders.get(email) || [];
    list.push(order);
    customerOrders.set(email, list);
  });
  const customerStats = [...customerOrders.entries()].map(([email, customerOrderList]) => {
    const purchases = customerOrderList.map((order) => parseDate(order.createdAt)).filter((date) => !Number.isNaN(date.getTime()));
    return {
      email,
      name: profilesByEmail.get(email)?.fullName || customerOrderList[0]?.customerName || email,
      orders: customerOrderList.length,
      spent: customerOrderList.reduce((sum, order) => sum + money(order.total), 0),
      averageTicket: customerOrderList.length
        ? customerOrderList.reduce((sum, order) => sum + money(order.total), 0) / customerOrderList.length
        : 0,
      firstPurchase: purchases.length ? new Date(Math.min(...purchases.map((date) => date.getTime()))) : null,
    };
  });
  const firstPurchaseCutoff = new Date(now.getTime() - 30 * 86400000);
  const newCustomers = customerStats.filter((customer) => customer.firstPurchase && customer.firstPurchase >= firstPurchaseCutoff).length;
  const recurringCustomers = customerStats.filter((customer) => customer.orders > 1).length;
  const totalCustomerOrders = customerStats.reduce((sum, customer) => sum + customer.orders, 0);
  const pairs = new Map();
  orders.forEach((order) => {
    const names = [...new Set((order.items || []).map((item) => String(item.name || '').trim()).filter(Boolean))];
    names.forEach((first, index) => names.slice(index + 1).forEach((second) => addToMap(pairs, [first, second].sort().join(' + '), 1)));
  });
  const addressRows = [];
  for (const addressBook of addressBooks) {
    if (!Array.isArray(addressBook.addresses)) {
      console.error('Uma lista de endereços do banco possui formato inválido.');
      return Response.json({ error: 'Não foi possível calcular os indicadores de endereços.' }, { status: 503 });
    }
    addressBook.addresses.forEach((address) => {
      if (address && typeof address === 'object' && !Array.isArray(address)) {
        addressRows.push({ email: addressBook.email.trim().toLowerCase(), address });
      }
    });
  }
  const customersWithAddress = new Set(addressRows.map(({ email }) => email));
  const profilesWithAddress = [...customersWithAddress].filter((email) => profilesByEmail.has(email)).length;
  const addressStates = new Map();
  const addressMunicipalities = new Map();
  addressRows.forEach(({ address }) => {
    const location = getDeliveryLocation({ addressDetails: address });
    if (location.state) addToMap(addressStates, location.state, 1);
    if (location.municipality) {
      const label = `${location.municipality}${location.state ? ` - ${location.state}` : ''}`;
      addToMap(addressMunicipalities, label, 1);
    }
  });
  const addressInsights = {
    profiles: customerProfiles.length,
    addressBooks: addressBooks.length,
    totalAddresses: addressRows.length,
    customersWithAddress: customersWithAddress.size,
    coveragePercent: customerProfiles.length ? (profilesWithAddress / customerProfiles.length) * 100 : null,
    states: [...addressStates.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
    municipalities: [...addressMunicipalities.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
  };
  const flashOfferItems = lineItems.filter((item) => item.promotionType === 'flash_offer');
  const flashOfferSales = new Map();
  flashOfferItems.forEach((item) => {
    const key = item.productId || item.product?.id || item.name;
    const current = flashOfferSales.get(key) || { orders: new Set(), quantity: 0, revenue: 0, discount: 0 };
    current.orders.add(item.order.id);
    current.quantity += item.quantity;
    current.revenue += item.revenue;
    current.discount += Number(item.promotionDiscount) || 0;
    flashOfferSales.set(key, current);
  });
  const flashOffers = products
    .filter((product) => product.flashOfferEnabled === true)
    .map((product) => {
      const status = getFlashOfferStatus(product, now.getTime());
      const sales = flashOfferSales.get(product.id) || { orders: new Set(), quantity: 0, revenue: 0, discount: 0 };
      return {
        id: product.id,
        title: product.title,
        state: status.state,
        price: status.price || Number(product.flashOfferPrice) || 0,
        startsAt: status.startsAt ? new Date(status.startsAt).toISOString() : product.flashOfferStart || null,
        endsAt: status.endsAt ? new Date(status.endsAt).toISOString() : product.flashOfferEnd || null,
        orders: sales.orders.size,
        quantity: sales.quantity,
        revenue: sales.revenue,
        discount: sales.discount,
      };
    });
  const promotions = {
    available: true,
    flashOffers,
    coupons: couponCampaigns.map((campaign) => {
      const code = campaign.code.toUpperCase();
      const couponOrders = orders.filter((order) => String(order.couponCode || '').toUpperCase() === code);
      const discount = couponOrders.reduce((sum, order) => {
        const savedDiscount = Number(order.couponDiscountAmount);
        return sum + (savedDiscount || Math.max(0, (Number(order.subtotal) || 0) - money(order.total)));
      }, 0);
      return {
        id: campaign.id,
        code,
        discountPercent: campaign.discountPercent,
        createdAt: campaign.createdAt,
        expiresAt: campaign.expiresAt,
        expired: campaign.expiresAt.getTime() <= now.getTime(),
        recipients: campaign._count.recipients,
        redemptions: campaign._count.redemptions,
        orders: couponOrders.length,
        revenue: couponOrders.reduce((sum, order) => sum + money(order.total), 0),
        discount,
      };
    }),
    summary: {
      activeFlashOffers: flashOffers.filter((offer) => offer.state === 'active').length,
      scheduledFlashOffers: flashOffers.filter((offer) => offer.state === 'scheduled').length,
      couponCampaigns: couponCampaigns.length,
      redeemedCoupons: couponCampaigns.reduce((sum, campaign) => sum + campaign._count.redemptions, 0),
      flashOfferOrders: new Set(flashOfferItems.map((item) => item.order.id)).size,
      flashOfferRevenue: flashOfferItems.reduce((sum, item) => sum + item.revenue, 0),
    },
  };
  const ordersWithKnownPayment = orders.filter((order) => (
    ['pix', 'cartao', 'dinheiro', 'outro'].includes(String(order.paymentMethod || '').toLowerCase())
  )).length;
  const categoryRanking = [...categoryStats.values()].map((item) => ({
    label: item.label,
    value: item.missingCostItems ? null : item.revenue - item.cost,
    revenue: item.revenue,
    cost: item.cost,
    missingCostItems: item.missingCostItems,
  })).sort((a, b) => (b.value || 0) - (a.value || 0));
  const brandRanking = [...brandStats.values()].map((item) => ({
    label: item.label,
    value: item.missingCostItems ? null : item.revenue - item.cost,
    revenue: item.revenue,
    cost: item.cost,
    missingCostItems: item.missingCostItems,
  })).sort((a, b) => (b.value || 0) - (a.value || 0));
  const invoiceCpf = {
    ...buildInvoiceCpfAnalytics(orders, customerProfiles),
    demographicsAvailable: true,
  };

  return Response.json({
    generatedAt: now.toISOString(),
    dataSources: {
      hasOrderHistory: ordersValue.length > 0,
      orders: ordersValue.length,
      products: products.length,
      customerProfiles: customerProfiles.length,
      savedAddresses: addressRows.length,
      customersWithAddress: customersWithAddress.size,
      ordersWithPayment: ordersWithKnownPayment,
      ordersWithoutPayment: orders.length - ordersWithKnownPayment,
    },
    sales: {
      revenue: filteredDateOrders.reduce((sum, item) => sum + money(item.order.total), 0),
      orders: filteredDateOrders.length,
      averageTicket: filteredDateOrders.length
        ? filteredDateOrders.reduce((sum, item) => sum + money(item.order.total), 0) / filteredDateOrders.length
        : 0,
      currentRevenue,
      previousRevenue,
      growth,
      startDate,
      endDate,
      daily: dailySeries,
      hourly: seriesFromMap(hourly),
      weekdays: seriesFromMap(weekdays),
      products: productStats,
      payments: [...paymentStats.values()],
      paymentCoverage: {
        informedOrders: ordersWithPaymentMethod,
        unknownOrders: filteredDateOrders.length - ordersWithPaymentMethod,
        totalOrders: filteredDateOrders.length,
      },
      purchases: purchaseDetails,
      periods: {
        today: todaySummary,
        week: weekSummary,
        month: monthSummary,
        previousWeek: previousWeekSummary,
        previousMonth: previousMonthSummary,
      },
    },
    profitability: {
      ...profitabilitySummary,
      products: productStats,
      categories: categoryRanking,
      brands: brandRanking,
    },
    inventory: {
      stockValue,
      stockValueComplete,
      uncostedStockProducts: uncostedStock.length,
      configuredMinimumStock: stock.filter((item) => item.minStock > 0).length,
      catalogProducts: stock.length,
      productsWithLots,
      lowStock,
      outOfStock,
      nearExpiry,
      nearExpiryLots,
      expiredLots,
      stock,
      coveragePercent: stock.length ? (productsWithLots / stock.length) * 100 : null,
      unconfiguredMinimumStock: stock.filter((item) => item.minStock <= 0).length,
    },
    customers: {
      total: customerOrders.size,
      newCustomers,
      recurringCustomers,
      purchaseFrequency: customerOrders.size ? totalCustomerOrders / customerOrders.size : 0,
      averageTicket: orders.length ? revenue / orders.length : 0,
      totalSpent: revenue,
      profiles: addressInsights.profiles,
      customersWithAddress: addressInsights.customersWithAddress,
      savedAddresses: addressInsights.totalAddresses,
      addressCoveragePercent: addressInsights.coveragePercent,
      addressStates: addressInsights.states,
      addressMunicipalities: addressInsights.municipalities,
      spending: customerStats.sort((a, b) => b.spent - a.spent).slice(0, 10),
      topProducts: productStats.slice(0, 8),
      pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })),
    },
    customerInsights: {
      available: true,
      gender: [...genderGroups.values()].filter((group) => group.customers > 0).sort((first, second) => second.orders - first.orders),
      ageGroups: [...ageGroupStats.values()].filter((group) => group.customers > 0).sort((first, second) => second.orders - first.orders),
      customersWithGender,
      customersWithBirthDate,
      customersWithOrders: customerOrdersForInsights.size,
    },
    addressInsights,
    abandonedCarts: abandonedCartAnalytics,
    geography,
    invoiceCpf,
    promotions,
  });
}