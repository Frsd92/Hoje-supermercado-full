export function parseCurrency(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const amount = String(value || '').replace(/[^\d,.-]/g, '');
  if (!amount) return 0;
  const normalized = amount.includes(',')
    ? amount.replace(/\./g, '').replace(',', '.')
    : amount;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOrderDate(value) {
  if (!value) return null;
  const isoDate = new Date(value);
  if (!Number.isNaN(isoDate.getTime())) return isoDate;

  const brazilianDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(value));
  if (!brazilianDate) return null;
  return new Date(Number(brazilianDate[3]), Number(brazilianDate[2]) - 1, Number(brazilianDate[1]));
}

export function getCurrentMonthSpend(orders, now = new Date()) {
  return orders.reduce((total, order) => {
    const date = parseOrderDate(order.createdAt);
    if (!date || date.getFullYear() !== now.getFullYear() || date.getMonth() !== now.getMonth()) return total;
    return total + parseCurrency(order.total);
  }, 0);
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export function getBudgetProgress(spent, budget) {
  return budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
}
