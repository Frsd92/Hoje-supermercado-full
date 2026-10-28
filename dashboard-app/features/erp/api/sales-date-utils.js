const saoPauloDateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const saoPauloDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function formatSaleDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : saoPauloDateTimeFormatter.format(date);
}

export function getSaleDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const parts = Object.fromEntries(
    saoPauloDatePartsFormatter.formatToParts(date).map(({ type, value: partValue }) => [type, partValue]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isSaleDateInRange(value, startDate = '', endDate = '') {
  const dateKey = getSaleDateKey(value);
  if (!dateKey || (startDate && endDate && startDate > endDate)) return false;
  return (!startDate || dateKey >= startDate) && (!endDate || dateKey <= endDate);
}
