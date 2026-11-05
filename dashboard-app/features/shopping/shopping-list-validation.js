export const MAX_SHOPPING_LISTS = 30;
export const MAX_SHOPPING_LIST_ITEMS = 100;
export const MAX_SHOPPING_LIST_NAME_LENGTH = 60;

export function normalizeShoppingListName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  return name.length > 0 && name.length <= MAX_SHOPPING_LIST_NAME_LENGTH ? name : null;
}

export function normalizeShoppingListItems(value) {
  if (!Array.isArray(value) || value.length > MAX_SHOPPING_LIST_ITEMS) return null;
  const items = [];
  const seen = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const productId = typeof item.productId === 'string' ? item.productId.trim() : '';
    const quantity = Number(item.quantity);
    const saleUnit = item.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade';
    const minQuantity = saleUnit === 'Quilograma' ? 0.1 : 1;
    if (!productId || productId.length > 200 || !Number.isFinite(quantity) || quantity < minQuantity || quantity > 9999) return null;
    if (saleUnit === 'Unidade' && !Number.isInteger(quantity)) return null;
    if (seen.has(productId)) return null;
    seen.add(productId);
    items.push({ productId, quantity: Math.round(quantity * 10) / 10, saleUnit });
  }
  return items;
}
