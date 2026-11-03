export function serializePublicProductRecord(record) {
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata
    : {};
  return {
    ...metadata,
    id: record.externalId || record.id,
    title: record.title,
    description: record.description || '',
    price: Number(record.price),
    discount: Number(record.discount) || 0,
    status: record.status,
    categories: record.categories || [],
    brand: record.brand || '',
    subcategory: record.subcategory || '',
    image: record.image || '',
    imageHash: record.imageHash || '',
  };
}
