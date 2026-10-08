const allowedRuleTypes = new Set([
  'FIRST_PURCHASE',
  'MINIMUM_SPEND',
  'PURCHASE_FREQUENCY',
  'CATEGORY_SPEND',
]);
const allowedRecurrences = new Set(['none', 'weekly']);
const allowedExpiryPolicies = new Set(['CYCLE_END', 'DAYS_AFTER_AWARD', 'FIXED_DATE', 'NEVER']);
const allowedMissionStatuses = new Set(['draft', 'active', 'paused', 'archived']);

function readDate(value, label, optional = false) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new RangeError(`${label} inválida.`);
  return date;
}

function parseOptionalPositiveInteger(value, label, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new RangeError(`${label} deve ser um número inteiro entre 1 e ${maximum}.`);
  }
  return number;
}

function parsePositiveInteger(value, label, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > maximum) {
    throw new RangeError(`${label} deve ser um número inteiro entre 1 e ${maximum}.`);
  }
  return number;
}

function parseAmount(value, label, allowZero = false) {
  const amount = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < (allowZero ? 0 : 0.01) || amount > 100_000_000) {
    throw new RangeError(`${label} está inválido.`);
  }
  return Math.round(amount * 100) / 100;
}

export function validateLoyaltyMissionPayload(body, { now = new Date(), statusRequired = true } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Os dados da missão são inválidos.');
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const ruleType = String(body.ruleType || '').trim();
  const recurrence = String(body.recurrence || '').trim();
  const pointsExpiryPolicy = String(body.pointsExpiryPolicy || '').trim();
  const status = String(body.status || (statusRequired ? '' : 'draft')).trim();
  const category = String(body.category || '').trim();
  const startsAt = readDate(body.startsAt, 'A data de início');
  const endsAt = readDate(body.endsAt, 'A data final', true);
  const pointsExpireAt = readDate(body.pointsExpireAt, 'A data de validade', true);
  const targetCount = ruleType === 'FIRST_PURCHASE'
    ? 1
    : parsePositiveInteger(body.targetCount ?? 1, 'A meta de compras', 10_000);
  const targetAmount = ['MINIMUM_SPEND', 'CATEGORY_SPEND'].includes(ruleType)
    ? parseAmount(body.targetAmount, 'A meta de valor')
    : 0;
  const pointsExpiryDays = pointsExpiryPolicy === 'DAYS_AFTER_AWARD'
    ? parsePositiveInteger(body.pointsExpiryDays, 'A validade em dias', 3650)
    : null;
  const rewardLimit = parseOptionalPositiveInteger(body.rewardLimit, 'O limite de recompensas', 10_000_000);
  const pointsReward = parsePositiveInteger(body.pointsReward, 'Os pontos da missão', 1_000_000);

  if (name.length < 3 || name.length > 80) throw new RangeError('O nome da missão deve ter entre 3 e 80 caracteres.');
  if (description.length > 500) throw new RangeError('A descrição pode ter no máximo 500 caracteres.');
  if (!allowedRuleTypes.has(ruleType)) throw new RangeError('Selecione uma regra de missão válida.');
  if (!allowedRecurrences.has(recurrence)) throw new RangeError('Selecione uma recorrência válida.');
  if (!allowedExpiryPolicies.has(pointsExpiryPolicy)) throw new RangeError('Selecione uma validade de pontos válida.');
  if (!allowedMissionStatuses.has(status)) throw new RangeError('Selecione um status de missão válido.');
  if (ruleType === 'FIRST_PURCHASE' && recurrence !== 'none') {
    throw new RangeError('A missão de primeira compra não pode se repetir semanalmente.');
  }
  if (endsAt && endsAt <= startsAt) throw new RangeError('A data final deve ser posterior à data inicial.');
  if (status === 'active' && endsAt && endsAt <= now) throw new RangeError('Uma missão com prazo encerrado não pode ser ativada.');
  if (ruleType === 'CATEGORY_SPEND' && (category.length < 2 || category.length > 80)) {
    throw new RangeError('Informe a categoria de produtos da missão.');
  }
  if (pointsExpiryPolicy === 'CYCLE_END' && recurrence !== 'weekly' && !endsAt) {
    throw new RangeError('Para expirar no fim do ciclo, defina o encerramento da missão ou use uma missão semanal.');
  }
  if (pointsExpiryPolicy === 'FIXED_DATE') {
    if (!pointsExpireAt || !endsAt || pointsExpireAt <= startsAt || pointsExpireAt <= endsAt) {
      throw new RangeError('Defina o encerramento da missão antes da data fixa de validade dos pontos.');
    }
  }

  return {
    name,
    description,
    ruleType,
    targetAmount,
    targetCount,
    category: ruleType === 'CATEGORY_SPEND' ? category : null,
    pointsReward,
    rewardLimit,
    recurrence,
    startsAt,
    endsAt,
    pointsExpiryPolicy,
    pointsExpiryDays,
    pointsExpireAt: pointsExpiryPolicy === 'FIXED_DATE' ? pointsExpireAt : null,
    status,
  };
}

export function validateLoyaltyRewardPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('Os dados da recompensa são inválidos.');
  const name = String(body.name || '').trim();
  const description = String(body.description || '').trim();
  const pointsCost = parsePositiveInteger(body.pointsCost, 'O custo em pontos', 1_000_000);
  const discountPercent = parsePositiveInteger(body.discountPercent, 'O desconto percentual', 90);
  const minimumOrderAmount = parseAmount(body.minimumOrderAmount ?? 0, 'O pedido mínimo', true);
  const validityDays = parsePositiveInteger(body.validityDays, 'A validade do cupom', 365);
  const active = body.active === undefined ? true : body.active;

  if (name.length < 3 || name.length > 80) throw new RangeError('O nome da recompensa deve ter entre 3 e 80 caracteres.');
  if (description.length > 300) throw new RangeError('A descrição pode ter no máximo 300 caracteres.');
  if (typeof active !== 'boolean') throw new TypeError('O status da recompensa é inválido.');

  return { name, description, pointsCost, discountPercent, minimumOrderAmount, validityDays, active };
}
