import { isLoyaltyPaymentStatusEligible, parseLoyaltyMoney } from './mission-rules.js';

function allocationPoints(allocations) {
  return (allocations || []).reduce((sum, allocation) => {
    if (!Number.isInteger(allocation.points) || allocation.points < 0) {
      throw new TypeError('Alocação de pontos inválida.');
    }
    return sum + allocation.points;
  }, 0);
}

export function getRefundAdjustedAwardPoints(entry) {
  if (!Number.isInteger(entry.points) || entry.points < 1) throw new TypeError('Crédito de pontos inválido.');
  if (!entry.sourceOrder) return entry.points;
  if (entry.sourceOrder.status === 'Cancelado'
    || !isLoyaltyPaymentStatusEligible(entry.sourceOrder.paymentStatus)) {
    return 0;
  }

  const orderTotal = Math.max(0, parseLoyaltyMoney(entry.sourceOrder.total));
  if (orderTotal <= 0) throw new RangeError('O pedido de origem não possui um total válido.');
  const refundedAmount = Math.min(orderTotal, Math.max(0, parseLoyaltyMoney(entry.sourceOrder.refundedAmount)));
  const totalCents = Math.round(orderTotal * 100);
  const refundedCents = Math.round(refundedAmount * 100);
  const removedPoints = Math.round(entry.points * refundedCents / totalCents);
  return Math.max(0, entry.points - removedPoints);
}

function currentAwardLots(entries, now) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new TypeError('Data de saldo inválida.');
  const redemptions = (entries || []).filter((entry) => entry.type === 'REDEMPTION');
  redemptions.forEach((entry) => {
    if (!Number.isInteger(entry.points) || entry.points >= 0) throw new TypeError('Débito de pontos inválido.');
    const allocated = allocationPoints(entry.spendsAllocations);
    if (allocated !== Math.abs(entry.points)) throw new TypeError('O resgate não está totalmente vinculado a créditos de pontos.');
  });

  return (entries || [])
    .filter((entry) => entry.type === 'MISSION_AWARD')
    .map((entry) => {
      const earned = getRefundAdjustedAwardPoints(entry);
      const consumed = allocationPoints(entry.awardsAllocations);
      const remaining = earned - consumed;
      const expiresAt = entry.expiresAt ? new Date(entry.expiresAt) : null;
      if (expiresAt && !Number.isFinite(expiresAt.getTime())) throw new TypeError('Validade de pontos inválida.');
      const expired = Boolean(expiresAt && expiresAt <= instant);
      return {
        id: entry.id,
        earned,
        consumed,
        remaining: expired ? Math.min(0, remaining) : remaining,
        expired,
        expiresAt,
        createdAt: new Date(entry.createdAt),
      };
    });
}

export function calculateLoyaltyPointBalance(entries, now = new Date()) {
  return currentAwardLots(entries, now).reduce((sum, lot) => sum + lot.remaining, 0);
}

export function planLoyaltyPointRedemption(entries, points, now = new Date()) {
  if (!Number.isInteger(points) || points < 1) throw new TypeError('Quantidade de pontos inválida.');
  const lots = currentAwardLots(entries, now);
  const balance = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (balance < points) return null;

  const activeCredits = lots
    .filter((lot) => !lot.expired && lot.remaining > 0)
    .sort((first, second) => {
      const firstExpiry = first.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const secondExpiry = second.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
      return firstExpiry - secondExpiry
        || first.createdAt.getTime() - second.createdAt.getTime()
        || first.id.localeCompare(second.id);
    })
    .map((lot) => ({ ...lot, available: lot.remaining }));
  let refundDebt = lots.reduce((sum, lot) => sum + Math.max(0, -lot.remaining), 0);

  activeCredits.forEach((lot) => {
    const offset = Math.min(refundDebt, lot.available);
    lot.available -= offset;
    refundDebt -= offset;
  });

  let remaining = points;
  const allocations = [];
  for (const lot of activeCredits) {
    if (remaining === 0) break;
    const amount = Math.min(remaining, lot.available);
    if (amount > 0) {
      allocations.push({ awardEntryId: lot.id, points: amount });
      remaining -= amount;
    }
  }
  if (remaining !== 0) throw new Error('Não foi possível alocar todos os pontos do resgate.');
  return allocations;
}
