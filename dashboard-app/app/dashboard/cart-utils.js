export function getCartItemCount(cart) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((total, item) => {
    if (item?.saleUnit === 'Quilograma' || item?.unit === 'kg') return total + 1;
    const quantity = Number(item?.quantity);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

export function normalizeCartItems(cart) {
  if (!Array.isArray(cart)) return [];
  const normalized = new Map();
  cart.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const name = String(item.name || '').trim();
    const productId = String(item.productId || item.id || '').trim();
    const key = name
      ? `name:${name.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`
      : productId ? `id:${productId}` : '';
    if (!key) return;
    const existing = normalized.get(key);
    if (!existing) {
      normalized.set(key, item);
      return;
    }
    const existingQuantity = Number(existing.quantity) || 1;
    const nextQuantity = Number(item.quantity) || 1;
    normalized.set(key, {
      ...existing,
      ...item,
      quantity: Math.max(existingQuantity, nextQuantity),
    });
  });
  return [...normalized.values()];
}

export function formatCartQuantity(item) {
  const quantity = Number(item?.quantity) || 1;
  if (item?.saleUnit !== 'Quilograma' && item?.unit !== 'kg') return String(Math.max(1, Math.trunc(quantity)));
  const grams = Math.round(quantity * 1000);
  return grams < 1000
    ? `${grams} g`
    : `${(grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

export function adjustCartQuantity(quantity, delta, saleUnit) {
  const step = saleUnit === 'Quilograma' || saleUnit === 'kg' ? 0.1 : 1;
  return Math.max(step, Math.round(((Number(quantity) || step) + (delta * step)) * 10) / 10);
}
