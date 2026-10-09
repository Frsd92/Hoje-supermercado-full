export const INVENTORY_COUNT_CATEGORIES = [
  'Vinhos',
  'Frutas',
  'Verduras',
  'Petshop',
  'Bebidas sem álcool',
  'Laticínio',
  'Carne',
  'Bomboniere',
  'Mercearia',
  'Limpeza',
  'Lavanderia',
  'Higiene Pessoal',
  'Bebês',
  'Outras categorias',
];

const fruitTerms = [
  'abacate', 'abacaxi', 'acerola', 'ameixa', 'banana', 'caqui', 'coco', 'figo',
  'goiaba', 'graviola', 'kiwi', 'laranja', 'limao', 'maca', 'mamao', 'manga',
  'maracuja', 'melancia', 'melao', 'morango', 'pera', 'pessego', 'pitaya',
  'tangerina', 'uva',
];

const vegetableTerms = [
  'acelga', 'agriao', 'alho', 'alface', 'almeirao', 'aspargo', 'batata', 'berinjela',
  'beterraba',   'brocolis', 'cara', 'cebola', 'cebolinha', 'cenoura', 'chuchu',
  'coentro', 'couve', 'couve flor', 'espinafre', 'jilo', 'mandioca', 'maxixe',
  'milho verde', 'moranga', 'pepino', 'pimentao', 'quiabo', 'rabanete', 'repolho',
  'rucula', 'salsinha', 'tomate', 'vagem',
];

export function normalizeInventoryCountLabel(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function matchesTerm(values, terms) {
  return values.some((value) => terms.some((term) => value === term || value.startsWith(`${term} `)));
}

function matchesProductTitle(product, terms) {
  const title = ` ${normalizeInventoryCountLabel(product?.title).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return terms.some((term) => title.includes(` ${term} `));
}

export function getInventoryCountCategory(product) {
  const metadata = product?.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  const categories = Array.isArray(product?.categories) ? product.categories : [];
  const normalizedCategories = categories.map(normalizeInventoryCountLabel).filter(Boolean);
  const department = normalizeInventoryCountLabel(product?.department || metadata.department);
  const subcategory = normalizeInventoryCountLabel(product?.subcategory || metadata.subcategory);
  const productType = normalizeInventoryCountLabel(product?.productType || metadata.productType);
  const primaryCategory = normalizedCategories[0] || department || subcategory || productType;
  const specificValues = [
    subcategory,
    productType,
  ].map(normalizeInventoryCountLabel).filter(Boolean);

  if (matchesTerm([primaryCategory], ['vinho', 'vinhos'])) return 'Vinhos';
  if (matchesTerm([primaryCategory], ['fruta', 'frutas'])) return 'Frutas';
  if (matchesTerm([primaryCategory], ['verdura', 'verduras'])) return 'Verduras';

  const isHortifruti = normalizedCategories.includes('hortifruti')
    || (!normalizedCategories.length && department === 'hortifruti');
  if (isHortifruti) {
    if (matchesTerm(specificValues, ['fruta', 'frutas', 'fruto', 'frutos'])) return 'Frutas';
    if (matchesTerm(specificValues, ['verdura', 'verduras', 'legume', 'legumes', 'hortalica', 'hortalicas', 'raiz', 'raizes', 'tuberculo', 'tuberculos'])) {
      return 'Verduras';
    }
    if (matchesProductTitle(product, fruitTerms)) return 'Frutas';
    if (matchesProductTitle(product, vegetableTerms)) return 'Verduras';
    return 'Outras categorias';
  }

  if (matchesTerm([primaryCategory], ['acougue', 'carne', 'carnes'])) return 'Carne';
  if (matchesTerm([primaryCategory], ['pet shop', 'petshop', 'pet shops'])) return 'Petshop';
  const isBeverageCategory = matchesTerm([primaryCategory], [
    'bebida',
    'bebidas',
    'bebida sem alcool',
    'bebidas sem alcool',
    'bebida nao alcoolica',
    'bebidas nao alcoolicas',
  ]);
  if (
    matchesTerm([primaryCategory], ['bebida alcoolica', 'bebidas alcoolicas', 'cerveja', 'cervejas'])
    || (isBeverageCategory && matchesTerm(specificValues, ['bebida alcoolica', 'bebidas alcoolicas', 'cerveja', 'cervejas']))
  ) {
    return 'Outras categorias';
  }
  if (isBeverageCategory && matchesTerm(specificValues, ['vinho', 'vinhos'])) return 'Vinhos';
  if (isBeverageCategory) return 'Bebidas sem álcool';

  if (matchesTerm([primaryCategory], ['laticinio', 'laticinios'])) return 'Laticínio';
  if (matchesTerm([primaryCategory], ['bomboniere'])) return 'Bomboniere';
  if (matchesTerm([primaryCategory], ['mercearia'])) return 'Mercearia';
  if (matchesTerm([primaryCategory], ['limpeza', 'limpexa', 'produtos de limpeza'])) return 'Limpeza';
  if (matchesTerm([primaryCategory], ['lavanderia'])) return 'Lavanderia';
  if (matchesTerm([primaryCategory], ['higiene pessoal'])) return 'Higiene Pessoal';
  if (matchesTerm([primaryCategory], ['bebe', 'bebes'])) return 'Bebês';

  return 'Outras categorias';
}

export function getInventoryCountSourceCategory(product) {
  const metadata = product?.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  const firstCategory = Array.isArray(product?.categories)
    ? product.categories.find((category) => String(category || '').trim())
    : '';
  const sourceValues = [
    firstCategory || product?.department || metadata.department,
    product?.subcategory || metadata.subcategory,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const uniqueValues = [...new Map(sourceValues.map((value) => [normalizeInventoryCountLabel(value), value])).values()];
  return uniqueValues.join(' · ') || 'Sem categoria';
}
