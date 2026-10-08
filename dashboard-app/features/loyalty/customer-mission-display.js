export const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

export const missionRuleLabels = {
  FIRST_PURCHASE: 'Primeira compra concluída',
  MINIMUM_SPEND: 'Valor acumulado em compras',
  PURCHASE_FREQUENCY: 'Frequência de compras',
  CATEGORY_SPEND: 'Compras em uma categoria',
};

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function missionProgress(mission) {
  if (['MINIMUM_SPEND', 'CATEGORY_SPEND'].includes(mission.ruleType)) {
    const current = Number(mission.progressAmount) || 0;
    const target = Number(mission.targetAmount) || 0;
    return {
      current: currencyFormatter.format(current),
      target: currencyFormatter.format(target),
      percent: target > 0 ? Math.min(100, current / target * 100) : 0,
    };
  }
  const current = Number(mission.progressCount) || 0;
  const target = Number(mission.targetCount) || 1;
  return {
    current: String(current),
    target: String(target),
    percent: Math.min(100, current / target * 100),
  };
}

export function getPointsProgressToNextReward(balanceValue, rewards) {
  const parsedBalance = Number(balanceValue);
  const balance = Number.isFinite(parsedBalance) ? parsedBalance : 0;
  const activeRewards = (Array.isArray(rewards) ? rewards : [])
    .filter((reward) => reward && typeof reward === 'object')
    .map((reward) => ({ ...reward, pointsCost: Number(reward.pointsCost) }))
    .filter((reward) => Number.isFinite(reward.pointsCost) && reward.pointsCost > 0)
    .sort((first, second) => first.pointsCost - second.pointsCost);

  if (!activeRewards.length) return null;

  const nextReward = activeRewards.find((reward) => reward.pointsCost > balance);
  const reward = nextReward || activeRewards[activeRewards.length - 1];
  const pointsNeeded = Math.max(0, reward.pointsCost - balance);

  return {
    reward,
    targetPoints: reward.pointsCost,
    pointsNeeded,
    percent: Math.max(0, Math.min(100, balance / reward.pointsCost * 100)),
    complete: pointsNeeded === 0,
  };
}

export function describeMission(mission) {
  if (mission.ruleType === 'FIRST_PURCHASE') return 'Faça sua primeira compra e conclua o pedido.';
  if (mission.ruleType === 'PURCHASE_FREQUENCY') {
    return `Conclua ${mission.targetCount} pedido(s)${mission.recurrence === 'weekly' ? ' nesta semana' : ''}.`;
  }
  if (mission.ruleType === 'CATEGORY_SPEND') {
    return `Acumule ${currencyFormatter.format(Number(mission.targetAmount))} em ${mission.category}.`;
  }
  return `Acumule ${currencyFormatter.format(Number(mission.targetAmount))} em compras.`;
}
