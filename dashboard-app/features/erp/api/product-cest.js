export function normalizeProductCest(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const cest = raw.replace(/[.\s-]/g, '');
  if (!/^\d{7}$/.test(cest)) {
    throw new Error('O CEST deve conter exatamente 7 dígitos.');
  }

  return cest;
}
