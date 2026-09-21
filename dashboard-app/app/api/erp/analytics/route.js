import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const dataDirectory = path.join(process.cwd(), 'data');
const allowedEmails = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);

const readJson = async (fileName, fallback) => {
  try { return JSON.parse(await fs.readFile(path.join(dataDirectory, fileName), 'utf8')); } catch { return fallback; }
};
const money = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;
const parseDate = (value) => {
  const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,\s*(\d{2}):(\d{2}):(\d{2}))?/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)) : new Date(value);
};
const dateKey = (date) => date.toISOString().slice(0, 10);
const labelDate = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function addToMap(map, key, value) { map.set(key, (map.get(key) || 0) + value); }
function seriesFromMap(map) { return [...map.entries()].map(([label, value]) => ({ label, value })); }

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const [ordersValue, productsValue, favoritesValue, cartValue] = await Promise.all([
    readJson('orders.json', []), readJson('products.json', []), readJson('favorites.json', {}), readJson('cart.json', {}),
  ]);
  const orders = (Array.isArray(ordersValue) ? ordersValue : []).filter((order) => order.status !== 'Cancelado');
  const products = Array.isArray(productsValue) ? productsValue : [];
  const productMap = new Map(products.map((product) => [String(product.title).trim().toLowerCase(), product]));
  const lineItems = orders.flatMap((order) => (order.items || []).map((item) => {
    const product = productMap.get(String(item.name || '').trim().toLowerCase());
    const quantity = Number(item.quantity) || 1;
    const revenue = money(item.price) * quantity;
    const cost = (Number(product?.cost) || 0) * quantity;
    return { ...item, product, quantity, revenue, cost, profit: revenue - cost, order };
  }));
  const revenue = orders.reduce((sum, order) => sum + money(order.total), 0);
  const cost = lineItems.reduce((sum, item) => sum + item.cost, 0);
  const now = new Date();
  const searchParams = new URL(request.url).searchParams;
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const validDateOrders = orders.map((order) => ({ order, date: parseDate(order.createdAt) })).filter(({ date }) => !Number.isNaN(date.getTime()));
  const last30 = new Date(now); last30.setDate(now.getDate() - 30);
  const previous30 = new Date(now); previous30.setDate(now.getDate() - 60);
  const currentOrders = validDateOrders.filter(({ date }) => date >= last30);
  const previousOrders = validDateOrders.filter(({ date }) => date >= previous30 && date < last30);
  const sumOrders = (items) => items.reduce((sum, item) => sum + money(item.order.total), 0);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPreviousWeek = new Date(startOfWeek); startOfPreviousWeek.setDate(startOfWeek.getDate() - 7);
  const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
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
    addToMap(daily, dateKey(date), money(order.total));
    addToMap(hourly, `${String(date.getHours()).padStart(2, '0')}h`, money(order.total));
    addToMap(weekdays, dayNames[date.getDay()], money(order.total));
  });
  const dailySeries = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-31).map(([key, value]) => ({ label: labelDate(new Date(`${key}T12:00:00`)), value }));
  const itemStats = new Map();
  const filteredOrderIds = new Set(filteredDateOrders.map(({ order }) => order.id));
  lineItems.filter((item) => (!(startDate || endDate) || filteredOrderIds.has(item.order.id))).forEach((item) => {
    const key = item.product?.title || item.name || 'Produto sem cadastro';
    const current = itemStats.get(key) || { title: key, quantity: 0, revenue: 0, cost: 0, category: item.product?.categories?.[0] || 'Sem categoria', brand: item.product?.brand || 'Sem marca' };
    current.quantity += item.quantity; current.revenue += item.revenue; current.cost += item.cost;
    itemStats.set(key, current);
  });
  const productStats = [...itemStats.values()].map((item) => ({ ...item, profit: item.revenue - item.cost, margin: item.revenue ? ((item.revenue - item.cost) / item.revenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);
  const paymentLabels = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro' };
  const paymentStats = new Map();
  filteredDateOrders.forEach(({ order }) => {
    const method = order.paymentMethod || 'nao_informado';
    const current = paymentStats.get(method) || { method, label: paymentLabels[method] || 'Não informado', orders: 0, value: 0 };
    current.orders += 1;
    current.value += money(order.total);
    paymentStats.set(method, current);
  });
  const purchaseDetails = filteredDateOrders.map(({ order, date }) => ({
    id: order.id,
    date: order.createdAt,
    sortDate: date.getTime(),
    customer: order.customerName || order.customerEmail || 'Cliente não identificado',
    paymentMethod: order.paymentMethod || 'nao_informado',
    paymentLabel: paymentLabels[order.paymentMethod] || 'Não informado',
    value: money(order.total),
    items: (order.items || []).reduce((total, item) => total + (Number(item.quantity) || 1), 0),
  })).sort((first, second) => second.sortDate - first.sortDate);
  const categoryStats = new Map(); const brandStats = new Map();
  productStats.forEach((item) => { addToMap(categoryStats, item.category, item.profit); addToMap(brandStats, item.brand, item.profit); });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const stock = products.map((product) => {
    const quantity = Number(product.quantity) || 0; const price = Number(product.price) || 0; const expiry = product.expiry ? parseDate(product.expiry) : null;
    return { title: product.title, quantity, stockValue: quantity * (Number(product.cost) || price), minStock: Number(product.minStock) || 0, expiry, daysToExpiry: expiry ? Math.ceil((expiry - today) / 86400000) : null, category: product.categories?.[0] || 'Sem categoria' };
  });
  const realUsers = new Set(orders.map((order) => order.customerEmail).filter((value) => String(value).includes('@')));
  const customerOrders = new Map();
  orders.forEach((order) => { if (String(order.customerEmail).includes('@')) { const list = customerOrders.get(order.customerEmail) || []; list.push(order); customerOrders.set(order.customerEmail, list); } });
  const customerStats = [...customerOrders.entries()].map(([email, customerOrderList]) => ({
    email,
    name: customerOrderList[0]?.customerName || email,
    orders: customerOrderList.length,
    spent: customerOrderList.reduce((sum, order) => sum + money(order.total), 0),
    averageTicket: customerOrderList.length ? customerOrderList.reduce((sum, order) => sum + money(order.total), 0) / customerOrderList.length : 0,
    firstPurchase: customerOrderList.map((order) => parseDate(order.createdAt)).sort((a, b) => a - b)[0],
  }));
  const firstPurchaseCutoff = new Date(now); firstPurchaseCutoff.setDate(now.getDate() - 30);
  const newCustomers = customerStats.filter((customer) => customer.firstPurchase >= firstPurchaseCutoff).length;
  const recurringCustomers = customerStats.filter((customer) => customer.orders > 1).length;
  const totalCustomerOrders = customerStats.reduce((sum, customer) => sum + customer.orders, 0);
  const pairs = new Map(); orders.forEach((order) => { const names = [...new Set((order.items || []).map((item) => String(item.name || '').trim()).filter(Boolean))]; names.forEach((first, index) => names.slice(index + 1).forEach((second) => addToMap(pairs, [first, second].sort().join(' + '), 1))); });

  return Response.json({
    generatedAt: now.toISOString(),
    sales: { revenue: filteredDateOrders.reduce((sum, item) => sum + money(item.order.total), 0), orders: filteredDateOrders.length, averageTicket: filteredDateOrders.length ? filteredDateOrders.reduce((sum, item) => sum + money(item.order.total), 0) / filteredDateOrders.length : 0, currentRevenue, previousRevenue, growth, startDate, endDate, daily: dailySeries, hourly: seriesFromMap(hourly), weekdays: seriesFromMap(weekdays), products: productStats, payments: [...paymentStats.values()], purchases: purchaseDetails, periods: { today: todaySummary, week: weekSummary, month: monthSummary, previousWeek: previousWeekSummary, previousMonth: previousMonthSummary } },
    profitability: { grossProfit: revenue - cost, margin: revenue ? ((revenue - cost) / revenue) * 100 : 0, cmv: cost, products: productStats, categories: [...categoryStats.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value), brands: [...brandStats.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) },
    inventory: { stockValue: stock.reduce((sum, item) => sum + item.stockValue, 0), lowStock: stock.filter((item) => item.minStock > 0 && item.quantity <= item.minStock), outOfStock: stock.filter((item) => item.quantity <= 0), nearExpiry: stock.filter((item) => item.daysToExpiry !== null && item.daysToExpiry >= 0 && item.daysToExpiry <= 30), stock },
    customers: { total: realUsers.size, newCustomers, recurringCustomers, purchaseFrequency: realUsers.size ? totalCustomerOrders / realUsers.size : 0, averageTicket: orders.length ? revenue / orders.length : 0, totalSpent: revenue, spending: customerStats.sort((a, b) => b.spent - a.spent).slice(0, 10), topProducts: productStats.slice(0, 8), pairs: [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })) },
    promotions: { available: false, message: 'Ainda não há histórico de preço promocional antes e durante da promoção para comparar.' },
  });
}