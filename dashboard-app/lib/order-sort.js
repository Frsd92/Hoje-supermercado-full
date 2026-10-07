export function parseOrderDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const createdAt = String(value || '').trim();
  if (!createdAt) return null;

  const brazilianDate = createdAt.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilianDate) {
    const [, day, month, year, hours = '0', minutes = '0', seconds = '0'] = brazilianDate;
    const parsedDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
    if (
      parsedDate.getFullYear() === Number(year)
      && parsedDate.getMonth() === Number(month) - 1
      && parsedDate.getDate() === Number(day)
      && parsedDate.getHours() === Number(hours)
      && parsedDate.getMinutes() === Number(minutes)
      && parsedDate.getSeconds() === Number(seconds)
    ) return parsedDate;
    return null;
  }

  const timestamp = Date.parse(createdAt);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

export function getDaysSincePurchase(value, now = new Date()) {
  const purchaseDate = parseOrderDate(value);
  if (!purchaseDate || Number.isNaN(now.getTime())) return null;

  return Math.max(0, Math.floor((now.getTime() - purchaseDate.getTime()) / 86400000));
}

function orderTimestamp(order) {
  const parsedDate = parseOrderDate(order?.createdAt);
  if (parsedDate) return parsedDate.getTime();

  const idTimestamp = Number(String(order?.id || '').match(/^PED-(\d+)$/)?.[1]);
  return Number.isFinite(idTimestamp) ? idTimestamp : 0;
}

export function sortOrdersNewestFirst(orders) {
  return [...orders].sort((first, second) => orderTimestamp(second) - orderTimestamp(first));
}