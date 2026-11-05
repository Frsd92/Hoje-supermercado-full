export function normalizeShoppingSearch(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function searchShoppingProducts(products, search, limit = 6) {
  const query = normalizeShoppingSearch(search);
  if (!query || !Array.isArray(products)) return [];
  return products
    .filter((product) => normalizeShoppingSearch([
      product?.title,
      product?.brand,
      product?.subcategory,
      ...(Array.isArray(product?.categories) ? product.categories : []),
    ].filter(Boolean).join(' ')).includes(query))
    .slice(0, limit);
}
