export function appendPriceHistory(currentProduct, nextValues, changedBy, date = new Date()) {
  const history = Array.isArray(currentProduct.priceHistory) ? currentProduct.priceHistory : [];
  const hasPriceChange = Number(currentProduct.price) !== Number(nextValues.price)
    || Number(currentProduct.cost || 0) !== Number(nextValues.cost || 0)
    || Number(currentProduct.discount || 0) !== Number(nextValues.discount || 0);

  if (!hasPriceChange) return history;
  return [...history, {
    date: date.toISOString(),
    price: Number(nextValues.price),
    cost: Number(nextValues.cost) || 0,
    discount: Number(nextValues.discount) || 0,
    changedBy,
  }];
}
