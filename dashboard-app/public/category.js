const categoryLabels = {
  hortifruti: 'Hortifruti',
  ofertas: 'Ofertas em destaque',
  carnes: 'Carnes',
  padaria: 'Padaria',
  laticinios: 'Laticínios',
  mercearia: 'Mercearia',
  bomboniere: 'Bomboniere',
  sucos: 'Sucos e Refrigerantes',
  bebidas: 'Bebidas',
  alcoolicas: 'Bebidas Alcoólicas',
  vinhos: 'Vinhos',
  limpeza: 'Limpeza',
  lavanderia: 'Lavanderia',
  higiene: 'Higiene Pessoal',
  pet: 'Pet Shop',
  bebes: 'Bebês',
};
const categoryDescriptions = {
  ofertas: 'Produtos marcados com o selo Oferta no cadastro do ERP.',
};

function normalizeCategory(value) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getCategory(productName) {
  const name = normalizeCategory(productName);
  if (/banana|maca gala|alface|cenoura|batata|laranja|uva|morango|fruta/.test(name) || (name.includes('tomate') && !name.includes('molho'))) return 'hortifruti';
  if (/carne|frango|bovino|salsicha|acougue/.test(name)) return 'carnes';
  if (/leite|queijo|iogurte|latic/.test(name)) return 'laticinios';
  if (/cafe|pao|bolacha|biscoito|padaria/.test(name)) return 'padaria';
  if (/vinho/.test(name)) return 'vinhos';
  if (/cerveja|vinho|whisky|vodka|gin|rum|tequila|licor|conhaque|espumante|alcool/.test(name)) return 'alcoolicas';
  if (/coca|refrigerante|suco|bebida/.test(name)) return 'bebidas';
  if (/detergente|sabao|amaciante|veja|omo|limpeza|agua sanitaria/.test(name)) return 'limpeza';
  if (/racao|pet|cachorro|gato/.test(name)) return 'pet';
  if (/arroz|feijao|macarrao|farinha|acucar|molho/.test(name)) return 'mercearia';
  return 'outros';
}

function isAlcoholic(productName) {
  return /cerveja|vinho|whisky|vodka|gin|rum|tequila|licor|conhaque|espumante|alcool/.test(normalizeCategory(productName));
}

function categoryKey(category) {
  return normalizeCategory(category).replaceAll(' ', '-');
}

async function loadCategory() {
  const category = new URLSearchParams(location.search).get('categoria') || 'hortifruti';
  const title = categoryLabels[category] || 'Categoria';
  document.title = `${title} | Hoje Supermercado`;
  document.getElementById('category-title').textContent = title;
  document.getElementById('category-description').textContent = categoryDescriptions[category] || 'Todos os produtos disponíveis nesta categoria.';

  const response = await fetch('/api/products');
  if (!response.ok) throw new Error('Não foi possível carregar os produtos desta categoria.');
  const { products = [] } = await response.json();
  const filteredProducts = category === 'ofertas'
    ? products.filter((product) => produtoTemSeloDeVitrine(product, 'Oferta'))
    : products.filter((product) => product.categories?.some((item) => categoryKey(item) === category)
      || categoryKey(product.department || '') === category);

  const container = document.getElementById('category-products');
  filteredProducts.forEach((product) => {
    const name = product.title;
    const salePrice = Number(product.salePrice ?? product.price);
    const porKg = product.saleUnit === 'Quilograma';
    const price = `R$ ${salePrice.toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}`;
    const oldPrice = salePrice < Number(product.price) ? ` <span class="old-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}</span>` : '';
    const imageSource = product.image || '';
    const safeName = escapeStoreHtml(name);
    const safeImage = escapeStoreHtml(imageSource);
    const safeId = escapeStoreHtml(product.id);
    const productCategory = escapeStoreHtml(getProductCardCategoryLabel(product));
    container.insertAdjacentHTML('beforeend', `<article class="product-card" data-id="${safeId}" data-sale-unit="${porKg ? 'Quilograma' : 'Unidade'}">${renderProductBadges(product)}<img src="${safeImage}" alt="${safeName}" class="product-img"><div class="product-category">${productCategory}</div>${renderProductDepartmentBadge(product)}<div class="product-name">${safeName}</div><div class="product-price">${price}${oldPrice}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Adicionar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)"><i data-lucide="trash-2"></i></button><span class="qty" data-quantity="${porKg ? '0.1' : '1'}">${porKg ? '100 g' : '1'}</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`);
  });

  document.getElementById('category-empty').hidden = filteredProducts.length > 0;
  adicionarCategoriasProdutos();
  adicionarBotoesFavorito();
  carregarCarrinhoDaApi();
  if (window.lucide) window.lucide.createIcons();
}

loadCategory().catch((error) => {
  console.error('Não foi possível carregar a categoria da loja:', error);
  document.getElementById('category-empty').hidden = false;
});
