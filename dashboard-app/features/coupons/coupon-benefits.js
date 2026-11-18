export const fixedCouponAmounts = Object.freeze([3, 6, 9, 14, 20]);

export const couponBenefitOptions = [
  { value: 'PERCENTAGE', label: 'Desconto percentual' },
  { value: 'FIXED_AMOUNT', label: 'Desconto de valor fixo' },
  { value: 'FREE_DELIVERY', label: 'Entrega grátis' },
  { value: 'FREE_SERVICE_FEE', label: 'Taxa de serviço zero' },
];

const fixedCouponAmountSet = new Set(fixedCouponAmounts);
const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function parseMoney(value, label) {
  const amount = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 100_000_000) {
    throw new RangeError(`${label} deve ser um valor em reais válido.`);
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(amount * 100 - cents) > 0.000001) {
    throw new RangeError(`${label} deve ter no máximo duas casas decimais.`);
  }
  return cents / 100;
}

function parseOptionalMoney(value, label) {
  if (value === null || value === undefined || value === '') return null;
  return parseMoney(value, label);
}

export function normalizeCouponMinimumOrderAmount(body) {
  const required = body?.minimumOrderRequired;
  if (required !== undefined && typeof required !== 'boolean') {
    throw new RangeError('Informe se o cupom exige compra mínima.');
  }
  if (required === false) return 0;

  const value = body?.minimumOrderAmount;
  if (required === true) return parseMoney(value, 'O pedido mínimo');
  if (value === null || value === undefined || value === '') return 0;

  const amount = Number(String(value).trim().replace(',', '.'));
  if (amount === 0) return 0;
  return parseMoney(value, 'O pedido mínimo');
}

export function normalizeCouponBenefit(body) {
  const benefitType = String(body?.benefitType || 'PERCENTAGE').trim();
  if (!couponBenefitOptions.some((option) => option.value === benefitType)) {
    throw new RangeError('Selecione um tipo de cupom válido.');
  }

  if (benefitType === 'PERCENTAGE') {
    const discountPercent = Number(body?.discountPercent);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90) {
      throw new RangeError('O desconto percentual deve ser um número inteiro entre 1 e 90.');
    }
    return {
      benefitType,
      discountPercent,
      discountAmount: 0,
      maximumDiscountAmount: parseOptionalMoney(body?.maximumDiscountAmount, 'O desconto máximo'),
    };
  }

  if (benefitType === 'FIXED_AMOUNT') {
    const discountAmount = parseMoney(body?.discountAmount, 'O desconto fixo');
    if (!fixedCouponAmountSet.has(discountAmount)) {
      throw new RangeError('Escolha um desconto fixo de R$ 3, R$ 6, R$ 9, R$ 14 ou R$ 20.');
    }
    return {
      benefitType,
      discountPercent: 0,
      discountAmount,
      maximumDiscountAmount: null,
    };
  }

  return {
    benefitType,
    discountPercent: 0,
    discountAmount: 0,
    maximumDiscountAmount: null,
  };
}

export function calculateCouponDiscountAmount(subtotalValue, options = {}) {
  const subtotal = Number(subtotalValue);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0;

  let discountAmount = 0;
  if (options.benefitType === 'FIXED_AMOUNT') {
    discountAmount = Number(options.discountAmount) || 0;
  } else if (options.benefitType === 'PERCENTAGE' || !options.benefitType) {
    const discountPercent = Number(options.discountPercent);
    if (Number.isFinite(discountPercent) && discountPercent > 0) {
      discountAmount = subtotal * Math.min(90, discountPercent) / 100;
    }
    const maximumDiscountAmount = Number(options.maximumDiscountAmount);
    if (Number.isFinite(maximumDiscountAmount) && maximumDiscountAmount > 0) {
      discountAmount = Math.min(discountAmount, maximumDiscountAmount);
    }
  }

  return Number(Math.min(subtotal, Math.max(0, discountAmount)).toFixed(2));
}

export function getCouponBenefitLabel(benefitType, discountPercent = 0, discountAmount = 0, maximumDiscountAmount = null) {
  if (benefitType === 'FREE_DELIVERY') return 'Entrega grátis';
  if (benefitType === 'FREE_SERVICE_FEE') return 'Taxa de serviço zero';
  if (benefitType === 'FIXED_AMOUNT') {
    return `${currencyFormatter.format(Number(discountAmount) || 0)} de desconto`;
  }
  const percentLabel = `${Number(discountPercent) || 0}% de desconto`;
  const maximum = Number(maximumDiscountAmount);
  return Number.isFinite(maximum) && maximum > 0
    ? `${percentLabel} (até ${currencyFormatter.format(maximum)})`
    : percentLabel;
}
