const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(saoPauloDateFormatter.formatToParts(date).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dueDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return dateKey(value);
}

function shiftMonth(monthKey, offset) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function parseAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function buildSupplierPayablesSummary(payables = [], now = new Date()) {
  const today = dateKey(now);
  const currentMonth = today.slice(0, 7);
  const dueSoonLimit = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const eligiblePayables = payables.filter((payable) => payable.invoiceStatus === 'Lançada');
  const unpaidPayables = eligiblePayables.filter((payable) => payable.status !== 'Paga');
  const openByDueDate = {
    overdue: 0,
    dueNext30Days: 0,
    dueLaterOrUnscheduled: 0,
  };
  const paidByMonth = new Map();
  let paidThisMonth = 0;

  for (const payable of eligiblePayables) {
    const amount = parseAmount(payable.amount);
    const paidDate = dateKey(payable.paidAt);
    if (payable.status === 'Paga') {
      if (paidDate) {
        const month = paidDate.slice(0, 7);
        paidByMonth.set(month, (paidByMonth.get(month) || 0) + amount);
        if (month === currentMonth) paidThisMonth += amount;
      }
      continue;
    }

    const dueDate = dueDateKey(payable.dueAt);
    if (!dueDate) openByDueDate.dueLaterOrUnscheduled += amount;
    else if (dueDate < today) openByDueDate.overdue += amount;
    else if (dueDate <= dueSoonLimit) {
      openByDueDate.dueNext30Days += amount;
    } else openByDueDate.dueLaterOrUnscheduled += amount;
  }

  const trend = Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonth(currentMonth, index - 5);
    return {
      key,
      label: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
        .format(new Date(`${key}-01T12:00:00Z`))
        .replace('.', ''),
      paid: roundMoney(paidByMonth.get(key) || 0),
    };
  });

  return {
    outstanding: roundMoney(unpaidPayables.reduce((sum, payable) => sum + parseAmount(payable.amount), 0)),
    overdue: roundMoney(openByDueDate.overdue),
    dueNext30Days: roundMoney(openByDueDate.dueNext30Days),
    dueLaterOrUnscheduled: roundMoney(openByDueDate.dueLaterOrUnscheduled),
    paidThisMonth: roundMoney(paidThisMonth),
    openCount: unpaidPayables.length,
    paidCountThisMonth: eligiblePayables.filter((payable) => (
      payable.status === 'Paga' && dateKey(payable.paidAt).slice(0, 7) === currentMonth
    )).length,
    openByDueDate: Object.fromEntries(Object.entries(openByDueDate).map(([key, value]) => [key, roundMoney(value)])),
    paidTrend: trend,
  };
}
