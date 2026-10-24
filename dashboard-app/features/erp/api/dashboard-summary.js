export function mergeDashboardProducts(databaseProducts, legacyProducts) {
  const productsById = new Map(
    legacyProducts
      .filter((product) => product?.id)
      .map((product) => [String(product.id), product]),
  );

  databaseProducts.forEach((product) => {
    productsById.set(String(product.externalId || product.id), {
      ...product,
      id: product.id,
    });
  });

  return [...productsById.values()];
}

export function countDashboardCustomers(emailSources) {
  const emails = new Set();
  emailSources.forEach((source) => {
    source.forEach((value) => {
      const email = String(value || '').trim().toLowerCase();
      if (email.includes('@')) emails.add(email);
    });
  });
  return emails.size;
}
