function normalizeFavoriteIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  const price = Number(decimalValue);
  return Number.isFinite(price) ? price : null;
}

function formatPrice(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

export function syncFavoritesWithCatalog(favorites, products) {
  if (!Array.isArray(favorites)) return [];

  const productsById = new Map();
  const productsByName = new Map();

  (Array.isArray(products) ? products : []).forEach((product) => {
    if (!product || typeof product !== 'object') return;
    const productId = String(product.id || product.externalId || '').trim();
    const productName = normalizeFavoriteIdentity(product.title || product.name);
    if (productId) productsById.set(productId, product);
    if (productName) productsByName.set(productName, product);
  });

  return favorites.map((favorite) => {
    if (!favorite || typeof favorite !== 'object' || Array.isArray(favorite)) return favorite;

    const favoriteId = String(favorite.productId || favorite.id || '').trim();
    const product = (favoriteId && productsById.get(favoriteId))
      || productsByName.get(normalizeFavoriteIdentity(favorite.name));
    if (!product) return favorite;

    const productId = product.id || product.externalId || favorite.productId || favorite.id || '';
    const regularPrice = parsePrice(product.price);
    const salePrice = parsePrice(product.salePrice ?? product.price);
    const categories = Array.isArray(product.categories) ? product.categories.filter(Boolean) : [];
    const productCategory = product.subcategory || categories.join(', ');
    const productSaleUnit = product.saleUnit === 'Quilograma' || product.saleUnit === 'kg'
      ? 'Quilograma'
      : product.saleUnit
        ? 'Unidade'
        : favorite.saleUnit || 'Unidade';

    const updatedFavorite = {
      ...favorite,
      id: productId,
      productId,
      name: product.title || favorite.name,
      category: productCategory || favorite.category || '',
      saleUnit: productSaleUnit,
    };

    if (typeof product.image === 'string') updatedFavorite.image = product.image;
    if (salePrice !== null) {
      updatedFavorite.price = formatPrice(salePrice);
      updatedFavorite.oldPrice = regularPrice !== null && regularPrice > salePrice
        ? formatPrice(regularPrice)
        : '';
    }

    return updatedFavorite;
  });
}
