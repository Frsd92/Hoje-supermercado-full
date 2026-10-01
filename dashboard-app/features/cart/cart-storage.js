import { normalizeCartItems } from '../../app/dashboard/cart-utils.js';

export function normalizeGuestCartId(value) {
  const guestId = String(value || '').trim();
  return /^[a-zA-Z0-9-]{1,80}$/.test(guestId) ? guestId : '';
}

function cartItemKey(item) {
  const name = String(item.name || '').trim();
  if (name) return `name:${name.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;
  const productId = String(item.productId || item.id || '').trim();
  return productId ? `id:${productId}` : '';
}

export function mergeCartItems(existingCart, incomingCart) {
  const merged = new Map();
  normalizeCartItems(existingCart).forEach((item) => merged.set(cartItemKey(item), item));
  normalizeCartItems(incomingCart).forEach((item) => {
    const key = cartItemKey(item);
    if (!key) return;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, item);
      return;
    }
    const existingQuantity = Number(existing.quantity) || 1;
    const incomingQuantity = Number(item.quantity) || 1;
    merged.set(key, {
      ...existing,
      ...item,
      quantity: Math.round((existingQuantity + incomingQuantity) * 1000) / 1000,
    });
  });
  return normalizeCartItems([...merged.values()]);
}
