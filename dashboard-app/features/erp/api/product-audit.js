const canonicalText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export function productIdentityKeys(product) {
  const barcodes = [...new Set([
    ...(Array.isArray(product.barcodes) ? product.barcodes : []),
    product.barcode,
  ].map((value) => String(value || '').replace(/\s+/g, '').toUpperCase()).filter(Boolean))];
  return {
    identityTitle: canonicalText(product.title),
    identitySku: String(product.sku || '').trim().toLocaleLowerCase('pt-BR') || null,
    identityBarcode: barcodes[0] || null,
    normalizedBarcodes: barcodes,
  };
}

export function findProductIdentityConflict(product, candidates, excludedId = '') {
  const keys = productIdentityKeys(product);
  for (const candidate of candidates) {
    if (String(candidate.id) === excludedId) continue;
    const candidateKeys = productIdentityKeys(candidate);
    if (candidateKeys.identityTitle === keys.identityTitle) return { product: candidate, field: 'este nome' };
    if (keys.identitySku && candidateKeys.identitySku === keys.identitySku) return { product: candidate, field: 'este SKU' };
    if (keys.normalizedBarcodes.some((barcode) => candidateKeys.normalizedBarcodes.includes(barcode))) {
      return { product: candidate, field: 'este código de barras' };
    }
  }
  return null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function productAuditSnapshot(product) {
  return JSON.parse(JSON.stringify(stableValue(product)));
}

export function getProductAuditChanges(before, after) {
  const previous = productAuditSnapshot(before);
  const next = productAuditSnapshot(after);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  return Object.fromEntries(keys.filter((key) => (
    Object.hasOwn(previous, key) !== Object.hasOwn(next, key)
    || JSON.stringify(previous[key]) !== JSON.stringify(next[key])
  )).map((key) => [key, {
    before: Object.hasOwn(previous, key) ? previous[key] : { __auditAbsent: true },
    after: Object.hasOwn(next, key) ? next[key] : { __auditAbsent: true },
  }]));
}

export function getAuditProductImage(entry, currentImage = '') {
  const snapshotImage = entry?.snapshot?.image;
  if (typeof snapshotImage === 'string' && snapshotImage) return snapshotImage;

  const imageChange = entry?.changes?.image;
  if (imageChange && typeof imageChange === 'object') {
    if (typeof imageChange.after === 'string' && imageChange.after) return imageChange.after;
    if (typeof imageChange.before === 'string' && imageChange.before) return imageChange.before;
  }

  return typeof currentImage === 'string' ? currentImage : '';
}

export function formatAuditValue(value) {
  if (value && typeof value === 'object' && value.__auditAbsent === true) return 'Campo não informado';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' && value.startsWith('data:image/')) return 'Imagem registrada (conteúdo preservado)';
  if (Array.isArray(value)) return value.length
    ? value.some((item) => item && typeof item === 'object') ? JSON.stringify(value) : value.map(String).join(', ')
    : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
