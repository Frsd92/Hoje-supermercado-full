function normalizeCartProductName(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const cartPriceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function getCartItemCount(cart) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((total, item) => {
    if (item?.saleUnit === 'Quilograma' || item?.unit === 'kg') return total + 1;
    const quantity = Number(item?.quantity);
    return total + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

export function isSameCartProduct(cartItem, product) {
  const cartProductId = String(cartItem?.productId || cartItem?.id || '').trim();
  const productId = String(product?.productId || product?.id || '').trim();
  if (cartProductId && productId) return cartProductId === productId;

  const cartProductName = normalizeCartProductName(cartItem?.name);
  return Boolean(cartProductName && cartProductName === normalizeCartProductName(product?.name));
}

export function removeCartProduct(cart, product) {
  if (!Array.isArray(cart)) return [];
  return cart.filter((item) => !isSameCartProduct(item, product));
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

export function updateCartPrices(cart, products) {
  if (!Array.isArray(cart) || !Array.isArray(products) || !products.length) return cart;

  const productsById = new Map(products.map((product) => [String(product.id || ''), product]));
  const productsByName = new Map(products.map((product) => [normalizeCartProductName(product.title), product]));
  let changed = false;
  const updatedCart = cart.map((item) => {
    const productId = String(item?.productId || item?.id || '');
    const product = productsById.get(productId) || productsByName.get(normalizeCartProductName(item?.name));
    const price = Number(product?.salePrice ?? product?.price);
    if (!product || !Number.isFinite(price) || price <= 0) return item;

    const isWeighted = item.saleUnit === 'Quilograma' || item.unit === 'kg';
    const nextPrice = `${cartPriceFormatter.format(price)}${isWeighted ? ' / kg' : ''}`;
    const currentPrice = String(item.price || '').replace(/\u00a0/g, ' ');
    if (currentPrice === nextPrice.replace(/\u00a0/g, ' ')) return item;

    changed = true;
    return { ...item, price: nextPrice };
  });

  return changed ? updatedCart : cart;
}
