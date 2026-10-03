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
