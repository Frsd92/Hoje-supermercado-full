export function normalizeProductBarcode(value) {
  const barcode = String(value ?? '').trim().replace(/[\s-]/g, '');
  return /^\d{8,14}$/.test(barcode) ? barcode : '';
}

export function getOpenFoodFactsProductName(payload) {
  const product = payload?.product;
  if (!product || typeof product !== 'object' || Array.isArray(product)) return '';

  const name = [product.product_name_pt, product.product_name]
    .find((value) => typeof value === 'string' && value.trim());
  return name ? name.trim().slice(0, 180) : '';
}
