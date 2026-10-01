const categoryLabels = {
  hortifruti: 'Hortifruti',
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
  document.title = `${title} | Hoje Supermercado`;
  document.getElementById('category-title').textContent = title;

  const response = await fetch('/api/products');
  const { products = [] } = await response.json();
  const filteredProducts = products.filter((product) => product.categories?.some((item) => categoryKey(item) === category));

  const container = document.getElementById('category-products');
  filteredProducts.forEach((product) => {
    const name = product.title;
    const salePrice = Number(product.salePrice ?? product.price);
    const porKg = product.saleUnit === 'Quilograma';
    const price = `R$ ${salePrice.toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}`;
    const oldPrice = Number(product.discount) > 0 ? ` <span class="old-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}</span>` : '';
    const imageSource = product.image || '';
    container.insertAdjacentHTML('beforeend', `<article class="product-card" data-id="${product.id}" data-sale-unit="${porKg ? 'Quilograma' : 'Unidade'}"><img src="${imageSource}" alt="${name}" class="product-img"><div class="product-category">${product.subcategory || product.categories.join(', ')}</div><div class="product-name">${name}</div><div class="product-price">${price}${oldPrice}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Adicionar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)">×</button><span class="qty" data-quantity="${porKg ? '0.1' : '1'}">${porKg ? '100 g' : '1'}</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`);
  });

  document.getElementById('category-empty').hidden = filteredProducts.length > 0;
  adicionarCategoriasProdutos();
  adicionarBotoesFavorito();
  carregarCarrinhoDaApi();
  if (window.lucide) window.lucide.createIcons();
}

loadCategory().catch(() => {
  document.getElementById('category-empty').hidden = false;
});
