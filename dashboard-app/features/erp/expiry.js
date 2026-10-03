const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export const EXPIRY_BANDS = [
  { key: 'overdue', label: 'Vencido' },
  { key: 'day-1', label: 'Até 1 dia' },
  { key: 'day-3', label: 'Até 3 dias' },
  { key: 'day-5', label: 'Até 5 dias' },
  { key: 'day-10', label: 'Até 10 dias' },
  { key: 'day-15', label: 'Até 15 dias' },
  { key: 'day-30', label: 'Até 30 dias' },
  { key: 'day-45', label: 'Até 45 dias' },
];

export function saoPauloDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateOnly(value) {
  const dateOnly = value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === dateOnly ? date : null;
}

export function getExpiryStatus(expiry, today = saoPauloDateString(), expiryTracked = true) {
  if (!expiry) {
    return expiryTracked
      ? { key: 'missing', label: 'Sem validade', detail: 'Data não cadastrada', daysLeft: null }
      : { key: 'not-tracked', label: 'Sem controle', detail: 'Validade não controlada', daysLeft: null };
  }

  const expiryDate = parseDateOnly(expiry);
  const todayDate = parseDateOnly(today);
  if (!expiryDate || !todayDate) {
    return { key: 'invalid', label: 'Data inválida', detail: 'Confira a data cadastrada', daysLeft: null };
  }

  const daysLeft = Math.round((expiryDate.getTime() - todayDate.getTime()) / DAY_IN_MILLISECONDS);
  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      key: 'overdue',
      label: 'Vencido',
      detail: `Vencido há ${overdueDays} ${overdueDays === 1 ? 'dia' : 'dias'}`,
      daysLeft,
    };
  }

  const band = [
    { key: 'day-1', maxDays: 1 },
    { key: 'day-3', maxDays: 3 },
    { key: 'day-5', maxDays: 5 },
    { key: 'day-10', maxDays: 10 },
    { key: 'day-15', maxDays: 15 },
    { key: 'day-30', maxDays: 30 },
    { key: 'day-45', maxDays: 45 },
  ].find(({ maxDays }) => daysLeft <= maxDays);

  if (!band) return { key: 'safe', label: 'Dentro do prazo', detail: `Vence em ${daysLeft} dias`, daysLeft };

  let detail = `Vence em ${daysLeft} dias`;
  if (daysLeft === 0) detail = 'Vence hoje';
  else if (daysLeft === 1) detail = 'Vence amanhã';

  return {
    key: band.key,
    label: EXPIRY_BANDS.find(({ key }) => key === band.key).label,
    detail,
    daysLeft,
  };
}
