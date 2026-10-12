const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const cpfPattern = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g;
const phonePattern = /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-.\s]?\d{4}\b/g;
const postalCodePattern = /\b\d{5}-?\d{3}\b/g;
const addressPattern = /\b(?:rua|avenida|av\.|alameda|travessa|rodovia)\s+[^,.;\n]+(?:,\s*(?:n[ºo.]?\s*)?\d+[^.;\n]*)?/gi;

export function redactPersonalInformation(value) {
  return String(value || '')
    .slice(0, 500)
    .replace(emailPattern, '[e-mail removido]')
    .replace(cpfPattern, '[CPF removido]')
    .replace(phonePattern, '[telefone removido]')
    .replace(postalCodePattern, '[CEP removido]')
    .replace(addressPattern, '[endereço removido]');
}

export function normalizeAssistantText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function rankAssistantProducts(products, message, limit = 30) {
  const queryTerms = [...new Set(normalizeAssistantText(message).split(/\s+/).filter((term) => term.length > 2))];
  const ranked = products
    .filter((product) => product?.status === 'Ativo' && product?.id && product?.title)
    .map((product) => {
      const searchableText = normalizeAssistantText([
        product.title,
        product.description,
        product.brand,
        product.subcategory,
        ...(Array.isArray(product.categories) ? product.categories : []),
      ].join(' '));
      const score = queryTerms.reduce((total, term) => total + (searchableText.includes(term) ? 1 : 0), 0);
      return { product, score };
    })
    .sort((first, second) => second.score - first.score);

  const matches = ranked.filter(({ score }) => score > 0);
  return (matches.length ? matches : ranked).slice(0, limit).map(({ product }) => product);
}

export function validateAssistantReply(value, candidateProducts) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const reply = typeof value.reply === 'string' ? value.reply.trim().slice(0, 1200) : '';
  if (!reply) return null;

  const productsById = new Map(candidateProducts.map((product) => [String(product.id), product]));
  const recommendedProductIds = Array.isArray(value.recommendedProductIds)
    ? [...new Set(value.recommendedProductIds.map(String))]
      .filter((id) => productsById.has(id))
      .slice(0, 4)
    : [];

  return {
    reply,
    recommendations: recommendedProductIds.map((id) => {
      const product = productsById.get(id);
      return {
        id,
        title: String(product.title).slice(0, 120),
        price: Number(product.salePrice) || 0,
        saleUnit: product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
        image: typeof product.image === 'string' ? product.image : '',
      };
    }),
  };
}
