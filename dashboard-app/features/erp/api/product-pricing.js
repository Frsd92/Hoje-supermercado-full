function parseAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

function calculateRegularSalePrice({ price: rawPrice, promotionalPrice: rawPromotionalPrice, discount: rawDiscount } = {}) {
  const price = parseAmount(rawPrice);
  const promotionalPrice = parseAmount(rawPromotionalPrice);
  const discount = Math.min(100, Math.max(0, Number(String(rawDiscount || '').replace(',', '.')) || 0));

  if (promotionalPrice > 0) return promotionalPrice;
  return Math.round(price * (1 - discount / 100) * 100) / 100;
}

export function getFlashOfferStatus(product, now = Date.now()) {
  if (product?.flashOfferEnabled !== true) return { state: 'disabled' };

  const price = parseAmount(product.flashOfferPrice);
  const startsAt = Date.parse(product.flashOfferStart);
  const endsAt = Date.parse(product.flashOfferEnd);
  const regularPrice = calculateRegularSalePrice(product);
  if (!Number.isFinite(startsAt)
    || !Number.isFinite(endsAt)
    || startsAt >= endsAt
    || price <= 0
    || price >= regularPrice) {
    return { state: 'invalid' };
  }

  if (endsAt <= now) return { state: 'expired', price, startsAt, endsAt };
  if (startsAt > now) return { state: 'scheduled', price, startsAt, endsAt };
  return { state: 'active', price, startsAt, endsAt };
}

export function calculateSalePrice(product, now = Date.now()) {
  const flashOffer = getFlashOfferStatus(product, now);
  if (flashOffer.state === 'active') return flashOffer.price;
  return calculateRegularSalePrice(product);
}

export function getOrderPromotionSnapshot(product, quantity, now = Date.now()) {
  const flashOffer = getFlashOfferStatus(product, now);
  const salePrice = flashOffer.state === 'active' ? flashOffer.price : calculateRegularSalePrice(product);
  const listPrice = parseAmount(product?.price);
  const promotionType = flashOffer.state === 'active'
    ? 'flash_offer'
    : salePrice < listPrice
      ? parseAmount(product?.promotionalPrice) > 0 ? 'catalog_price' : 'catalog_discount'
      : 'regular';

  return {
    salePrice,
    promotionType,
    promotionDiscount: Math.max(0, Number(((listPrice - salePrice) * quantity).toFixed(2))),
  };
}

export function validateFlashOfferConfiguration(product, input, now = Date.now()) {
  if (product?.status !== 'Ativo') {
    return { error: 'Ative o produto no catálogo antes de programar uma oferta relâmpago.' };
  }

  const price = parseAmount(input?.flashOfferPrice);
  const startsAt = Date.parse(input?.flashOfferStart);
  const endsAt = Date.parse(input?.flashOfferEnd);
  const regularPrice = calculateRegularSalePrice(product);
  if (price <= 0 || price >= regularPrice) {
    return { error: 'O preço relâmpago deve ser maior que zero e menor que o preço de venda atual.' };
  }
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || startsAt >= endsAt) {
    return { error: 'Informe início e término válidos; o término deve ser posterior ao início.' };
  }
  if (endsAt <= now) {
    return { error: 'O término da oferta precisa estar no futuro.' };
  }

  return {
    value: {
      flashOfferEnabled: true,
      flashOfferPrice: price,
      flashOfferStart: new Date(startsAt).toISOString(),
      flashOfferEnd: new Date(endsAt).toISOString(),
    },
  };
}
