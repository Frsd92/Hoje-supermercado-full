function orderTimestamp(order) {
  const createdAt = String(order?.createdAt || '').trim();
  if (createdAt) {
    const brazilianDate = createdAt.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brazilianDate) {
      const [, day, month, year, hours = '00', minutes = '00', seconds = '00'] = brazilianDate;
      return new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}`).getTime();
    }
    const parsedDate = Date.parse(createdAt);
    if (!Number.isNaN(parsedDate)) return parsedDate;
  }

  const idTimestamp = Number(String(order?.id || '').match(/^PED-(\d+)$/)?.[1]);
  return Number.isFinite(idTimestamp) ? idTimestamp : 0;
}

export function sortOrdersNewestFirst(orders) {
  return [...orders].sort((first, second) => orderTimestamp(second) - orderTimestamp(first));
}