function normalizeValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeList(values) {
  return (Array.isArray(values) ? values : [])
    .map(normalizeValue)
    .filter(Boolean);
}

function hasSharedValue(first, second) {
  return first.some((value) => second.includes(value));
}

function productNameTerms(value) {
  return normalizeValue(value)
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4 && !/^\d+$/.test(term));
}

export function isProductAvailableForQuantity(product, quantity) {
  const requested = Number(quantity);
  const stock = Number(product?.quantity);
  return product?.status === 'Ativo'
    && Number.isFinite(requested)
    && requested > 0
    && Number.isFinite(stock)
    && stock >= requested;
}

export function getProductSubstituteScore(source, candidate) {
  if (!source || !candidate || String(source.id) === String(candidate.id)) return 0;

  let score = 0;
  if (hasSharedValue(normalizeList(source.categories), normalizeList(candidate.categories))) score += 4;

  const sourceSubcategory = normalizeValue(source.subcategory);
  const candidateSubcategory = normalizeValue(candidate.subcategory);
  if (sourceSubcategory && sourceSubcategory === candidateSubcategory) score += 5;

  const sourceType = normalizeValue(source.productType);
  const candidateType = normalizeValue(candidate.productType);
  if (sourceType && sourceType === candidateType) score += 4;

  const sourceBrand = normalizeValue(source.brand);
  const candidateBrand = normalizeValue(candidate.brand);
  if (sourceBrand && sourceBrand === candidateBrand) score += 2;

  const sharedNameTerms = new Set(productNameTerms(source.title)
    .filter((term) => productNameTerms(candidate.title).includes(term)));
  score += Math.min(sharedNameTerms.size, 3);

  return score;
}

export function getAvailableProductSubstitutes({
  source,
  products,
  quantity,
  excludedIds = [],
  limit = 3,
}) {
  const excluded = new Set(excludedIds.map(String));
  if (source?.id) excluded.add(String(source.id));
  const candidates = products
    .filter((product) => !excluded.has(String(product.id)))
    .filter((product) => isProductAvailableForQuantity(product, quantity))
    .map((product) => ({ product, score: getProductSubstituteScore(source, product) }))
    .filter(({ score }) => score > 0)
    .sort((first, second) => second.score - first.score
      || (Number(second.product.salesCount) || 0) - (Number(first.product.salesCount) || 0)
      || String(first.product.title).localeCompare(String(second.product.title), 'pt-BR'));

  return candidates.slice(0, limit).map(({ product }) => product);
}
