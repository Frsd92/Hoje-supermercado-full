function normalizeSearchValue(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

export function matchesProductSearch(product, query) {
  const searchTerms = normalizeSearchValue(query).trim().split(/\s+/).filter(Boolean);
  if (!searchTerms.length) return true;

  const values = [
    product?.title,
    product?.name,
    product?.id,
    product?.externalId,
    product?.sku,
    product?.barcode,
    product?.barcodes,
    product?.category,
    product?.categories,
    product?.department,
    product?.subcategory,
  ].flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== null && value !== undefined)
    .map(normalizeSearchValue);
  const searchableText = values.join(' ');
  const compactSearchableText = searchableText.replace(/[^a-z0-9]/g, '');

  return searchTerms.every((term) => (
    searchableText.includes(term)
    || compactSearchableText.includes(term.replace(/[^a-z0-9]/g, ''))
  ));
}

function searchPriority(product, query) {
  const normalizedQuery = normalizeSearchValue(query).trim();
  const compactQuery = normalizedQuery.replace(/[^a-z0-9]/g, '');
  const title = normalizeSearchValue(product?.title || product?.name || '').trim();
  const identifiers = [product?.sku, product?.barcode, product?.barcodes, product?.id, product?.externalId]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== null && value !== undefined)
    .map(normalizeSearchValue);
  const otherFields = [product?.category, product?.categories, product?.department, product?.subcategory]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => value !== null && value !== undefined)
    .map(normalizeSearchValue);
  const titleStartsWithQuery = title.startsWith(normalizedQuery);
  const titleWordStartsWithQuery = title.split(/\s+/).some((word) => word.startsWith(normalizedQuery));
  const identifierStartsWithQuery = identifiers.some((value) => (
    value.startsWith(normalizedQuery)
    || value.replace(/[^a-z0-9]/g, '').startsWith(compactQuery)
  ));
  const otherFieldStartsWithQuery = otherFields.some((value) => value.startsWith(normalizedQuery));
  const isNumericQuery = /^\d+$/.test(compactQuery);

  if (isNumericQuery && identifierStartsWithQuery) return 0;
  if (titleStartsWithQuery) return isNumericQuery ? 1 : 0;
  if (titleWordStartsWithQuery) return isNumericQuery ? 2 : 1;
  if (identifierStartsWithQuery) return isNumericQuery ? 0 : 2;
  if (otherFieldStartsWithQuery) return 3;
  return 4;
}

export function searchProductsByPriority(products, query) {
  if (!normalizeSearchValue(query).trim()) return { items: [], totalMatches: 0 };

  const matches = (Array.isArray(products) ? products : [])
    .map((product, index) => ({ product, index }))
    .filter(({ product }) => matchesProductSearch(product, query))
    .sort((first, second) => (
      searchPriority(first.product, query) - searchPriority(second.product, query)
      || first.index - second.index
    ));

  return {
    items: matches.slice(0, 30).map(({ product }) => product),
    totalMatches: matches.length,
  };
}
