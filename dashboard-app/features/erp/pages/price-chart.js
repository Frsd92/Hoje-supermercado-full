export const PRICE_RANGES = [
  { id: '1D', label: '1D' },
  { id: '5D', label: '5D' },
  { id: '1M', label: '1M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1A', label: '1A' },
  { id: '5A', label: '5A' },
  { id: 'MAX', label: 'Máx' },
];

export function getEffectiveRecordedPrice(point) {
  const price = Number(point.price);
  const discount = Math.min(100, Math.max(0, Number(point.discount) || 0));
  return Number((price * (1 - discount / 100)).toFixed(2));
}

export function getPriceHistorySyncStatus(history, currentPrice) {
  const recordedHistory = (Array.isArray(history) ? history : [])
    .filter((point) => Number.isFinite(new Date(point.date).getTime()) && Number.isFinite(Number(point.price)))
    .sort((first, second) => new Date(first.date) - new Date(second.date));
  const latest = recordedHistory.at(-1);
  if (!latest) return { status: 'missing', currentPrice: Number(currentPrice) || 0, recordedPrice: null };
  const recordedPrice = getEffectiveRecordedPrice(latest);
  const normalizedCurrentPrice = Number(Number(currentPrice || 0).toFixed(2));
  return {
    status: recordedPrice === normalizedCurrentPrice ? 'matched' : 'mismatch',
    currentPrice: normalizedCurrentPrice,
    recordedPrice,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function startOfSaoPauloYear(now) {
  const year = Number(saoPauloDateFormatter.formatToParts(now).find((part) => part.type === 'year')?.value);
  return new Date(Date.UTC(year, 0, 1, 3));
}

export function getPriceRangeStart(range, now, firstRecordDate) {
  if (range === 'MAX') return firstRecordDate || now;
  if (range === '1D') {
    const [year, month, day] = saoPauloDateFormatter.format(now).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 3));
  }
  if (range === 'YTD') return startOfSaoPauloYear(now);
  if (range === '5D') return new Date(now.getTime() - 5 * DAY_MS);

  const start = new Date(now);
  if (range === '1M') start.setUTCMonth(start.getUTCMonth() - 1);
  if (range === '6M') start.setUTCMonth(start.getUTCMonth() - 6);
  if (range === '1A') start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (range === '5A') start.setUTCFullYear(start.getUTCFullYear() - 5);
  return start;
}

export function getNicePriceTicks(minimum, maximum, count = 5) {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || count < 2) return [];
  const span = maximum - minimum;
  const paddedSpan = span || Math.max(Math.abs(maximum) * 0.1, 1);
  const rawStep = paddedSpan / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalizedStep = rawStep / magnitude;
  const niceStep = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10) * magnitude;
  const rangeMin = span ? minimum : minimum - paddedSpan / 2;
  const rangeMax = span ? maximum : maximum + paddedSpan / 2;
  const firstTick = Math.floor(rangeMin / niceStep) * niceStep;
  const lastTick = Math.ceil(rangeMax / niceStep) * niceStep;
  const ticks = [];
  for (let value = firstTick; value <= lastTick + niceStep * 1e-9; value += niceStep) {
    ticks.push(Number(value.toFixed(8)));
  }
  return ticks;
}

export function buildPriceChart(history, range, now = new Date()) {
  const records = (Array.isArray(history) ? history : [])
    .map((point) => ({ ...point, date: new Date(point.date), price: getEffectiveRecordedPrice(point) }))
    .filter((point) => Number.isFinite(point.date.getTime()) && Number.isFinite(point.price))
    .sort((first, second) => first.date - second.date)
    .filter((point, index, all) => index === 0 || point.price !== all[index - 1].price);

  if (!records.length) return { points: [], ticks: [], start: now, end: now, min: 0, max: 1 };

  const start = getPriceRangeStart(range, now, records[0].date);
  const end = now.getTime() > start.getTime() ? now : new Date(start.getTime() + 1);
  const previous = records.filter((point) => point.date < start).at(-1);
  const inRange = records.filter((point) => point.date >= start && point.date <= now);
  const points = [
    ...(previous ? [{ ...previous, xDate: start, baseline: true }] : []),
    ...inRange.map((point) => ({ ...point, xDate: point.date, baseline: false })),
  ];
  if (!points.length) return { points: [], ticks: [], start, end, min: 0, max: 1 };

  const prices = points.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const ticks = getNicePriceTicks(min, max);
  return { points, ticks, start, end, min: ticks[0], max: ticks[ticks.length - 1] };
}

export function formatPriceAxis(value) {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function formatPriceTimeAxis(date, range) {
  const options = range === '1D'
    ? { hour: '2-digit', minute: '2-digit' }
    : range === '5D' || range === '1M'
      ? { day: '2-digit', month: 'short' }
      : { month: 'short', year: range === 'MAX' ? 'numeric' : undefined };
  return new Intl.DateTimeFormat('pt-BR', {
    ...options,
    timeZone: 'America/Sao_Paulo',
  }).format(date).replace('.', '');
}

export function priceChartY(price, minimum, maximum) {
  const span = maximum - minimum || 1;
  return 88 - ((price - minimum) / span) * 78;
}
