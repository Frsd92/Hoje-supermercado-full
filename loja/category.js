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

function getTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatOfferCount(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderFlashOfferExperience(products, activeOffers) {
  const feature = document.getElementById('flash-offer-feature');
  const summary = document.getElementById('flash-offer-summary');
  const activeCount = document.getElementById('flash-offer-active-count');
  const countdownCard = document.getElementById('flash-countdown-card');
  const countdownLabel = document.getElementById('flash-countdown-label');
  const countdown = document.getElementById('category-flash-countdown');
  const listHeading = document.getElementById('flash-offer-list-heading');
  const listCount = document.getElementById('flash-offer-list-count');
  const now = Date.now();
  const scheduledOffers = products.filter((product) => {
    const startsAt = getTimestamp(product.flashOfferScheduledStart);
    const endsAt = getTimestamp(product.flashOfferEndsAt);
    return startsAt !== null && startsAt > now && endsAt !== null && endsAt > startsAt;
  });

  feature.hidden = false;
  listHeading.hidden = activeOffers.length === 0;
  listCount.textContent = formatOfferCount(activeOffers.length, 'produto ativo', 'produtos ativos');

  if (activeOffers.length) {
    const scheduledCount = scheduledOffers.length;
    summary.textContent = scheduledCount
      ? 'Aproveite os preços especiais ativos agora. Uma nova oferta também pode começar durante esta campanha.'
      : 'Aproveite os preços especiais ativos agora, antes que o prazo termine.';
    activeCount.textContent = `${formatOfferCount(activeOffers.length, 'oferta ativa', 'ofertas ativas')} agora`;
  } else if (scheduledOffers.length) {
    summary.textContent = 'Nenhuma oferta está ativa neste momento. A próxima campanha começa em breve.';
    activeCount.textContent = formatOfferCount(scheduledOffers.length, 'oferta programada', 'ofertas programadas');
  } else {
    summary.textContent = 'As ofertas especiais aparecem aqui quando estiverem ativas. Volte em breve para conferir as novidades.';
    activeCount.textContent = 'Novas ofertas em breve';
  }

  const activeEnd = activeOffers.reduce((next, product) => {
    const endsAt = getTimestamp(product.flashOfferEndsAt);
    return endsAt !== null && endsAt > now ? Math.min(next, endsAt) : next;
  }, Infinity);
  const scheduledStart = scheduledOffers.reduce((next, product) => {
    const startsAt = getTimestamp(product.flashOfferScheduledStart);
    return startsAt !== null ? Math.min(next, startsAt) : next;
  }, Infinity);
  const nextOfferStartsFirst = scheduledStart < activeEnd;
  const deadline = Math.min(activeEnd, scheduledStart);

  if (!Number.isFinite(deadline)) {
    countdownCard.hidden = true;
    return { scheduledOffers };
  }

  countdownCard.hidden = false;
  countdownLabel.textContent = activeOffers.length && !nextOfferStartsFirst
    ? (activeOffers.length === 1 ? 'Esta oferta termina em' : 'A próxima oferta termina em')
    : 'A próxima oferta começa em';
  countdown.setAttribute('aria-label', countdownLabel.textContent);

  const updateCountdown = () => {
    const remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    const units = {
      days: Math.floor(remainingSeconds / 86400),
      hours: Math.floor((remainingSeconds % 86400) / 3600),
      minutes: Math.floor((remainingSeconds % 3600) / 60),
      seconds: remainingSeconds % 60,
    };
    Object.entries(units).forEach(([unit, value]) => {
      countdown.querySelector(`[data-flash-${unit}]`).textContent = String(value).padStart(2, '0');
    });

    if (remainingSeconds === 0) {
      window.clearInterval(countdownTimer);
      summary.textContent = 'Atualizando as ofertas...';
      window.setTimeout(() => window.location.reload(), 800);
    }
  };

  countdownTimer = window.setInterval(updateCountdown, 1000);
  updateCountdown();
  return { scheduledOffers };
}

let countdownTimer = null;

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
    ? products.filter((product) => (
      product.flashOfferActive === true
      && getTimestamp(product.flashOfferEndsAt) > Date.now()
    )).sort((first, second) => getTimestamp(first.flashOfferEndsAt) - getTimestamp(second.flashOfferEndsAt))
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
  const emptyMessage = document.getElementById('category-empty-message');
  const emptyLink = document.getElementById('category-empty-link');
  emptyState.hidden = filteredProducts.length > 0;
  if (category === 'ofertas-relampago') {
    const { scheduledOffers } = renderFlashOfferExperience(products, filteredProducts);
    emptyMessage.textContent = scheduledOffers.length
      ? 'Nenhuma oferta ativa agora. Confira a contagem acima para saber quando a próxima começa.'
      : 'Nenhuma oferta relâmpago ativa agora. Volte em breve para conferir as próximas ofertas.';
    emptyLink.hidden = false;
  } else {
    emptyMessage.textContent = 'Nenhum produto disponível nesta categoria.';
    emptyLink.hidden = true;
  }
  adicionarCategoriasProdutos();
  adicionarBotoesFavorito();
  carregarCarrinhoDaApi();
  if (window.lucide) window.lucide.createIcons();
}

loadCategory().catch((error) => {
  console.error('Não foi possível carregar a categoria da loja:', error);
  document.getElementById('category-empty').hidden = false;
  document.getElementById('category-empty-message').textContent = 'Não foi possível carregar os produtos. Verifique sua conexão e tente atualizar a página.';
  document.getElementById('category-empty-link').hidden = true;
});
