function normalizeValue(field, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  if (field === 'ncm' || field === 'barcode') return String(value).replace(/\D/g, '');
  if (field === 'price') {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) : null;
  }
  return String(value).trim();
}

function remoteFields(product) {
  return {
    title: product?.nome ?? null,
    sku: product?.codigo ?? null,
    price: product?.preco ?? null,
    barcode: product?.gtin ?? null,
    ncm: product?.tributacao?.ncm ?? product?.ncm ?? null,
  };
}

export function verifyBlingProductPayload(payload, remoteProduct) {
  const fields = remoteFields(remoteProduct);
  const expected = {
    title: payload.nome,
    sku: payload.codigo,
    price: payload.preco,
    ...(payload.gtin ? { barcode: payload.gtin } : {}),
    ...(payload.tributacao?.ncm ? { ncm: payload.tributacao.ncm } : {}),
  };
  const mismatches = Object.entries(expected)
    .filter(([field, value]) => normalizeValue(field, fields[field]) !== normalizeValue(field, value))
    .map(([field]) => field);

  return {
    verifiedData: {
      fields,
      mismatches,
      verifiedAt: new Date().toISOString(),
    },
    mismatches,
  };
}

export function getBlingFieldSyncStatus(verifiedData, field, value) {
  const currentValue = normalizeValue(field, value);
  if (currentValue === null || currentValue === '') return 'missing';
  const verifiedFields = verifiedData?.fields;
  if (!verifiedFields || !Object.hasOwn(verifiedFields, field)) return 'pending';
  const savedValue = normalizeValue(field, verifiedFields[field]);
  if (savedValue === null || savedValue === '') return 'divergent';
  if (currentValue === savedValue) return 'confirmed';
  return verifiedData.mismatches?.includes(field) ? 'divergent' : 'pending';
}
