export const couponBenefitOptions = [
  { value: 'PERCENTAGE', label: 'Desconto percentual' },
  { value: 'FREE_DELIVERY', label: 'Entrega grátis' },
  { value: 'FREE_SERVICE_FEE', label: 'Taxa de serviço zero' },
];

export function getCouponBenefitLabel(benefitType, discountPercent = 0) {
  if (benefitType === 'FREE_DELIVERY') return 'Entrega grátis';
  if (benefitType === 'FREE_SERVICE_FEE') return 'Taxa de serviço zero';
  return `${Number(discountPercent) || 0}% de desconto`;
}
