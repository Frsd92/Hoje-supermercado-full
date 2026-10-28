export const subscriptionBillingCycles = new Set(['MONTHLY', 'YEARLY', 'ONCE']);

export function getSubscriptionPeriod(date, billingCycle) {
  const dateKey = typeof date === 'string' ? date.slice(0, 10) : date?.toISOString().slice(0, 10);
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new TypeError('Data de cobrança inválida.');
  if (billingCycle === 'MONTHLY') return dateKey.slice(0, 7);
  if (billingCycle === 'YEARLY') return dateKey.slice(0, 4);
  if (billingCycle === 'ONCE') return dateKey;
  throw new RangeError('Frequência de cobrança inválida.');
}

export function getNextSubscriptionDueDate(date, billingCycle) {
  if (!subscriptionBillingCycles.has(billingCycle)) throw new RangeError('Frequência de cobrança inválida.');
  const dateKey = typeof date === 'string' ? date.slice(0, 10) : date?.toISOString().slice(0, 10);
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new TypeError('Data de cobrança inválida.');
  if (billingCycle === 'ONCE') return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const targetMonthIndex = year * 12 + month - 1 + (billingCycle === 'MONTHLY' ? 1 : 12);
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay))).toISOString().slice(0, 10);
}
