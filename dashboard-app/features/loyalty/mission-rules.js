const dayMs = 24 * 60 * 60 * 1000;
const validRuleTypes = new Set([
  'FIRST_PURCHASE',
  'MINIMUM_SPEND',
  'PURCHASE_FREQUENCY',
  'CATEGORY_SPEND',
]);

export const loyaltyMissionRuleOptions = [
  { value: 'FIRST_PURCHASE', label: 'Primeira compra concluída' },
  { value: 'MINIMUM_SPEND', label: 'Valor acumulado em compras' },
  { value: 'PURCHASE_FREQUENCY', label: 'Frequência de compras' },
  { value: 'CATEGORY_SPEND', label: 'Compras em uma categoria' },
];

export const loyaltyPointExpiryOptions = [
  { value: 'CYCLE_END', label: 'Fim do ciclo da missão' },
  { value: 'DAYS_AFTER_AWARD', label: 'Dias após ganhar os pontos' },
  { value: 'FIXED_DATE', label: 'Data definida pelo ERP' },
  { value: 'NEVER', label: 'Não expiram' },
];

export function normalizeLoyaltyCategory(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function parseLoyaltyMoney(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Valor monetário inválido.');
    return value;
  }
  if (typeof value?.toNumber === 'function') {
    const amount = value.toNumber();
    if (!Number.isFinite(amount)) throw new TypeError('Valor monetário inválido.');
    return amount;
  }

  let normalized = String(value).trim().replace(/[^0-9,.-]/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) throw new TypeError('Valor monetário inválido.');
  return amount;
}

export function isLoyaltyPaymentStatusEligible(value) {
  return ['manual', 'paid', 'partially_refunded'].includes(String(value || '').toLowerCase());
}

function saoPauloDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function saoPauloMidnightToUtc(year, month, day) {
  let timestamp = Date.UTC(year, month - 1, day, 3);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = saoPauloDateParts(new Date(timestamp));
    const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    const targetLocalAsUtc = Date.UTC(year, month - 1, day);
    timestamp += targetLocalAsUtc - localAsUtc;
  }
  return new Date(timestamp);
}

export function getWeeklyLoyaltyCycle(at) {
  const instant = new Date(at);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Data do ciclo semanal inválida.');
  const parts = saoPauloDateParts(instant);
  const localDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const daysSinceMonday = (localDay.getUTCDay() + 6) % 7;
  localDay.setUTCDate(localDay.getUTCDate() - daysSinceMonday);
  const cycleStartAt = saoPauloMidnightToUtc(
    localDay.getUTCFullYear(),
    localDay.getUTCMonth() + 1,
    localDay.getUTCDate(),
  );
  return {
    cycleStartAt,
    cycleEndAt: new Date(cycleStartAt.getTime() + 7 * dayMs),
  };
}

export function getLoyaltyMissionCycle(mission, at) {
  const instant = new Date(at);
  const startsAt = new Date(mission.startsAt);
  const endsAt = mission.endsAt ? new Date(mission.endsAt) : null;
  if (!Number.isFinite(instant.getTime()) || !Number.isFinite(startsAt.getTime())
    || (endsAt && !Number.isFinite(endsAt.getTime()))) {
    throw new TypeError('Período da missão inválido.');
  }
  if (instant < startsAt || (endsAt && instant >= endsAt)) return null;

  if (mission.recurrence === 'weekly') {
    const cycle = getWeeklyLoyaltyCycle(instant);
    return {
      cycleStartAt: cycle.cycleStartAt,
      cycleEndAt: endsAt && endsAt < cycle.cycleEndAt ? endsAt : cycle.cycleEndAt,
    };
  }
  if (mission.recurrence !== 'none') throw new RangeError('Recorrência da missão inválida.');
  return {
    cycleStartAt: startsAt,
    cycleEndAt: endsAt || new Date('9999-12-31T23:59:59.999Z'),
  };
}

export function getLoyaltyPointExpiryAt(mission, cycleEndAt, awardedAt) {
  const awardDate = new Date(awardedAt);
  if (!Number.isFinite(awardDate.getTime())) throw new TypeError('Data do crédito de pontos inválida.');

  if (mission.pointsExpiryPolicy === 'NEVER') return null;
  if (mission.pointsExpiryPolicy === 'CYCLE_END') {
    const cycleEnd = new Date(cycleEndAt);
    if (!Number.isFinite(cycleEnd.getTime()) || cycleEnd <= awardDate) {
      throw new RangeError('A validade da missão não permite creditar os pontos.');
    }
    return cycleEnd;
  }
  if (mission.pointsExpiryPolicy === 'DAYS_AFTER_AWARD') {
    const days = Number(mission.pointsExpiryDays);
    if (!Number.isInteger(days) || days < 1) throw new RangeError('Prazo de validade de pontos inválido.');
    return new Date(awardDate.getTime() + days * dayMs);
  }
  if (mission.pointsExpiryPolicy === 'FIXED_DATE') {
    const expiry = new Date(mission.pointsExpireAt);
    if (!Number.isFinite(expiry.getTime()) || expiry <= awardDate) {
      throw new RangeError('Data de validade dos pontos inválida.');
    }
    return expiry;
  }
  throw new RangeError('Regra de validade dos pontos inválida.');
}

export function getLoyaltyOrderContribution(order, mission, previousCompletedOrders = 0) {
  if (order.status !== 'Concluido'
    || !isLoyaltyPaymentStatusEligible(order.paymentStatus)) {
    return null;
  }

  const total = Math.max(0, parseLoyaltyMoney(order.total));
  const refunded = Math.min(total, Math.max(0, parseLoyaltyMoney(order.refundedAmount)));
  const netTotal = Math.round((total - refunded) * 100) / 100;
  if (netTotal <= 0) return null;

  if (!validRuleTypes.has(mission.ruleType)) throw new RangeError('Tipo de missão inválido.');
  if (mission.ruleType === 'FIRST_PURCHASE' && previousCompletedOrders > 0) return null;

  if (mission.ruleType !== 'CATEGORY_SPEND') {
    return { contributionAmount: netTotal, contributionCount: 1 };
  }

  const category = normalizeLoyaltyCategory(mission.category);
  if (!category) throw new RangeError('Categoria da missão inválida.');
  const subtotal = Math.max(0, parseLoyaltyMoney(order.subtotal));
  if (subtotal <= 0) return null;
  const categorySubtotal = (order.items || []).reduce((sum, item) => {
    const categories = Array.isArray(item.product?.categories) ? item.product.categories : [];
    if (!categories.some((itemCategory) => normalizeLoyaltyCategory(itemCategory) === category)) return sum;
    const price = Math.max(0, parseLoyaltyMoney(item.price));
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) throw new TypeError('Quantidade do item inválida.');
    return sum + price * quantity;
  }, 0);
  const contributionAmount = Math.min(netTotal, Math.round((categorySubtotal * netTotal / subtotal) * 100) / 100);
  return contributionAmount > 0 ? { contributionAmount, contributionCount: 1 } : null;
}

export function isLoyaltyMissionComplete(mission, progress) {
  if (mission.ruleType === 'FIRST_PURCHASE' || mission.ruleType === 'PURCHASE_FREQUENCY') {
    return progress.progressCount >= Number(mission.targetCount);
  }
  if (mission.ruleType === 'MINIMUM_SPEND' || mission.ruleType === 'CATEGORY_SPEND') {
    return Number(progress.progressAmount) >= parseLoyaltyMoney(mission.targetAmount);
  }
  throw new RangeError('Tipo de missão inválido.');
}

export function allocateLoyaltyMissionPoints(points, contributions, ruleType) {
  if (!Number.isInteger(points) || points < 1 || !Array.isArray(contributions) || !contributions.length) {
    throw new TypeError('Não é possível distribuir os pontos da missão.');
  }
  const equalWeights = ruleType === 'FIRST_PURCHASE' || ruleType === 'PURCHASE_FREQUENCY';
  const weights = contributions.map((contribution) => {
    const value = equalWeights
      ? Number(contribution.contributionCount)
      : parseLoyaltyMoney(contribution.contributionAmount);
    if (!Number.isFinite(value) || value < 0) throw new TypeError('Peso de progresso inválido.');
    return value;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = totalWeight > 0 ? weights : weights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0);
  const allocations = contributions.map((contribution, index) => {
    const exact = points * effectiveWeights[index] / effectiveTotal;
    return { contribution, points: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = points - allocations.reduce((sum, allocation) => sum + allocation.points, 0);
  const byRemainder = [...allocations].sort((first, second) => (
    second.remainder - first.remainder
    || String(first.contribution.orderId).localeCompare(String(second.contribution.orderId))
  ));
  for (let index = 0; index < remaining; index += 1) byRemainder[index].points += 1;
  remaining = allocations.reduce((sum, allocation) => sum + allocation.points, 0);
  if (remaining !== points) throw new Error('A distribuição dos pontos não fechou o total da missão.');
  return allocations.map(({ contribution, points: allocatedPoints }) => ({
    orderId: contribution.orderId,
    points: allocatedPoints,
  })).filter((allocation) => allocation.points > 0);
}
