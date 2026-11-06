export function normalizeProductOrganizationValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function normalizeProductMainCategory(value) {
  const category = String(value || '').trim();
  return normalizeProductOrganizationValue(category) === 'bebidas'
    ? 'Sucos e Refrigerantes'
    : category;
}

export function normalizeProductMainCategories(categories) {
  if (!Array.isArray(categories)) return [];
  return [...new Set(categories.map(normalizeProductMainCategory).filter(Boolean))];
}

export function usesHortifrutiOrganization(product) {
  const hasHortifrutiCategory = Array.isArray(product?.categories)
    && product.categories.some((category) => normalizeProductOrganizationValue(category) === 'hortifruti');
  return hasHortifrutiCategory || normalizeProductOrganizationValue(product?.department) === 'hortifruti';
}

export function getProductOrganizationError(product) {
  const hasHortifrutiCategory = Array.isArray(product?.categories)
    && product.categories.some((category) => normalizeProductOrganizationValue(category) === 'hortifruti');
  const department = normalizeProductOrganizationValue(product?.department);
  const category = normalizeProductOrganizationValue(product?.subcategory);

  if (!hasHortifrutiCategory && department !== 'hortifruti') return '';
  if (!hasHortifrutiCategory) return 'Marque Hortifruti em Categorias para publicar o produto nesse departamento.';
  if (department !== 'hortifruti') return 'Preencha Departamento com Hortifruti para exibir esse selo na vitrine.';
  if (!category || category === 'hortifruti') return 'Preencha Categoria com uma classificação específica, por exemplo Fruta ou Verdura.';
  return '';
}
