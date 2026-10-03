const categoryLabels = {
  hortifruti: 'Hortifruti',
  ofertas: 'Ofertas em destaque',
  'ofertas-relampago': 'Ofertas Relâmpago',
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
  const description = category === 'ofertas'
    ? 'Confira produtos com ofertas em destaque no Hoje Supermercado.'
    : category === 'ofertas-relampago'
    ? 'Confira ofertas por tempo limitado com preço especial e período definido pelo Hoje Supermercado.'
    : `Encontre ${title.toLowerCase()} no Hoje Supermercado e consulte os produtos disponíveis no catálogo.`;
  const canonical = new URL('/categoria.html', 'https://www.hojesupermercado.com.br');
  canonical.searchParams.set('categoria', category);
  document.title = `${title} | Hoje Supermercado`;
  document.getElementById('category-title').textContent = title;
  document.getElementById('category-description').textContent = description;
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical.href);
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', document.title);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical.href);

  const response = await fetch('/api/products?purpose=store');
  if (!response.ok) throw new Error('Não foi possível carregar os produtos desta categoria.');
  const { products = [] } = await response.json();
  const filteredProducts = category === 'ofertas'
    ? products.filter((product) => produtoTemSeloDeVitrine(product, 'Oferta'))
    : category === 'ofertas-relampago'
    ? products.filter((product) => product.flashOfferActive === true)
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
    container.insertAdjacentHTML('beforeend', `<article class="product-card" data-id="${safeId}" data-sale-unit="${porKg ? 'Quilograma' : 'Unidade'}">${renderProductBadges(product)}<img src="${safeImage}" alt="${safeName}" class="product-img" loading="lazy" decoding="async"><div class="product-category">${productCategory}</div>${renderProductDepartmentBadge(product)}<div class="product-name">${safeName}</div><div class="product-price">${price}${oldPrice}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Adicionar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)"><i data-lucide="trash-2"></i></button><span class="qty" data-quantity="${porKg ? '0.1' : '1'}">${porKg ? '100 g' : '1'}</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`);
  });

  const emptyState = document.getElementById('category-empty');
  emptyState.hidden = filteredProducts.length > 0;
  if (category === 'ofertas-relampago') {
    emptyState.textContent = 'Nenhuma oferta relâmpago ativa agora. Volte em breve para conferir as próximas ofertas.';
  }
  if (category === 'ofertas-relampago') {
    const nextTransition = products.reduce((next, product) => {
      const transition = product.flashOfferActive
        ? Date.parse(product.flashOfferEndsAt)
        : Date.parse(product.flashOfferScheduledStart);
      return Number.isFinite(transition) && transition > Date.now() ? Math.min(next, transition) : next;
    }, Infinity);
    if (Number.isFinite(nextTransition)) {
      const delay = Math.min(Math.max(nextTransition - Date.now() + 1000, 1000), 2_147_000_000);
      window.setTimeout(() => window.location.reload(), delay);
    }
  }
  adicionarCategoriasProdutos();
  adicionarBotoesFavorito();
  carregarCarrinhoDaApi();
  if (window.lucide) window.lucide.createIcons();
}

loadCategory().catch((error) => {
  console.error('Não foi possível carregar a categoria da loja:', error);
  document.getElementById('category-empty').hidden = false;
});
