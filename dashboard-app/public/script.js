// Chamada toda vez que uma seta de carrossel (‹ ou ›) é clicada
function moveCarousel(botao, direcao) {
  const track = botao.parentElement.querySelector('.scroll-target');
  const distancia = 200;
  track.scrollBy({
    left: distancia * direcao,
    behavior: 'smooth'
  });
}

const FAVORITES_API = '/api/favorites';
const CART_API = '/api/cart';
const SESSION_API = '/api/store-session';
const ADDRESSES_API = '/api/addresses';
const PAYMENT_METHODS = ['pix', 'cartao', 'dinheiro', 'outro'];
let sessaoLoja = { authenticated: false, user: null };
let carrinhoHidratado = false;
let carrinhoAtualizando = false;
let carrinhoRevision = 0;
let carrinhoGravacoesPendentes = 0;
let filaGravacaoCarrinho = Promise.resolve();
let carrinhoItens = [];
let cupomAplicado = { codigo: '', percentual: 0 };

function idCarrinhoVisitante() {
  const storageKey = 'hoje-cart-id';
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, id);
  }
  return id;
}

function opcoesCarrinho(options = {}) {
  return {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.headers || {}),
      'X-Hoje-Cart-Id': idCarrinhoVisitante(),
    },
  };
}

function normalizarItemCarrinho(item) {
  const nome = String(item.nome || item.name || '').trim();
  const rawPrice = item.preco ?? item.price ?? 0;
  const priceText = String(rawPrice).replace(/[^0-9,.-]/g, '');
  const preco = typeof rawPrice === 'number'
    ? rawPrice
    : Number(priceText.includes(',') ? priceText.replace(/\./g, '').replace(',', '.') : priceText) || 0;
  return {
    id: String(item.id || item.productId || nome),
    nome,
    categoria: String(item.categoria || item.category || inferirCategoria(nome)),
    qty: Number(item.qty ?? item.quantity) || 1,
    preco,
    imagem: String(item.imagem || item.image || ''),
    saleUnit: item.saleUnit === 'Quilograma' || item.unit === 'kg' ? 'Quilograma' : 'Unidade',
  };
}

async function sincronizarCarrinhoApi(itens) {
  if (!carrinhoHidratado) return;
  const cart = itens.map((item) => ({
    productId: item.id,
    name: item.nome,
    category: item.categoria,
    price: formatarPreco(item.preco),
    image: item.imagem || '',
    quantity: item.qty,
    saleUnit: item.saleUnit,
  }));
  carrinhoGravacoesPendentes += 1;
  filaGravacaoCarrinho = filaGravacaoCarrinho
    .then(async () => {
      const response = await fetch(CART_API, opcoesCarrinho({
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ cart }),
      }));
      if (!response.ok) throw new Error(`Falha ao salvar carrinho (${response.status})`);
    })
    .catch((error) => {
      console.warn('Não foi possível sincronizar o carrinho:', error.message);
    })
    .finally(() => {
      carrinhoGravacoesPendentes -= 1;
    });
  await filaGravacaoCarrinho;
}

async function carregarCarrinhoDaApi() {
  if (carrinhoAtualizando) return;

  carrinhoAtualizando = true;
  const revisionAtStart = carrinhoRevision;
  let persistirCarrinhoLocal = false;
  try {
    const response = await fetch(CART_API, opcoesCarrinho({ cache: 'no-store' }));
    if (!response.ok) throw new Error(`Falha ao carregar carrinho (${response.status})`);
    const { cart = [] } = await response.json();
    const localCartChanged = carrinhoRevision !== revisionAtStart || carrinhoGravacoesPendentes > 0;

    if (localCartChanged) {
      persistirCarrinhoLocal = carrinhoRevision !== revisionAtStart;
    } else {
      carrinhoItens = cart.map(normalizarItemCarrinho);
      document.querySelectorAll('.product-card').forEach((card) => {
        const nome = card.querySelector('.product-name')?.textContent.trim();
        const normalizedName = normalizarCatalogo(nome);
        const controls = card.querySelector('.qty-controls');
        const quantity = card.querySelector('.qty');
        const buyButton = card.querySelector('.btn-comprar');
        if (!nome || !controls || !quantity || !buyButton) return;
        const item = cart.find((savedItem) => (
          (card.dataset.id && String(savedItem.productId || savedItem.id || '') === card.dataset.id)
          || normalizarCatalogo(savedItem.name) === normalizedName
        ));
        if (item) {
          definirQuantidade(card, Number(item.quantity) || (produtoVendidoPorKg(card) ? 0.1 : 1));
          controls.classList.add('show');
          buyButton.style.display = 'none';
        } else {
          definirQuantidade(card, produtoVendidoPorKg(card) ? 0.1 : 1);
          controls.classList.remove('show');
          buyButton.style.display = 'block';
        }
      });

      carrinhoHidratado = true;
      renderizarCarrinho(false);
    }

  } catch (error) {
    console.warn('Carrinho compartilhado indisponível:', error.message);
    persistirCarrinhoLocal = carrinhoRevision !== revisionAtStart;
  } finally {
    carrinhoHidratado = true;
    carrinhoAtualizando = false;
    if (persistirCarrinhoLocal) renderizarCarrinho();
  }
}

async function carregarSessaoDaLoja() {
  try {
    const response = await fetch(`${SESSION_API}?t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Sessão indisponível (${response.status})`);
    const data = await response.json();
    sessaoLoja = data;
    atualizarBotaoFinalizarCompra();

    const nameElement = document.getElementById('store-user-name');
    const statusElement = document.getElementById('store-user-status');
    const favoritesElement = document.getElementById('store-favorites-count');

    if (sessaoLoja.authenticated) {
      const primeiroNome = sessaoLoja.user?.name?.split(' ')[0] || 'cliente';
      if (nameElement) nameElement.textContent = `Olá, ${primeiroNome}`;
      if (statusElement) statusElement.textContent = 'Abrir meu painel';
      document.getElementById('login-trigger')?.classList.add('is-authenticated');
      document.getElementById('login-trigger')?.setAttribute('aria-label', 'Abrir meu painel');
      if (favoritesElement) favoritesElement.textContent = 'Favoritos carregando...';
    } else {
      if (nameElement) nameElement.textContent = 'Olá, faça seu login';
      if (statusElement) statusElement.textContent = 'ou cadastre-se';
      document.getElementById('login-trigger')?.classList.remove('is-authenticated');
      document.getElementById('login-trigger')?.setAttribute('aria-label', 'Ir para o login do dashboard');
      if (favoritesElement) favoritesElement.textContent = 'Entre para favoritar';
    }

    document.querySelectorAll('.fav-btn').forEach((button) => {
      button.disabled = !sessaoLoja.authenticated;
      button.title = sessaoLoja.authenticated ? 'Adicionar aos favoritos' : 'Entre para favoritar';
    });

    if (sessaoLoja.authenticated) await carregarFavoritosDaApi();
    await carregarEnderecosDaApi();
    await carregarCarrinhoDaApi();
  } catch (error) {
    sessaoLoja = { authenticated: false, user: null };
    atualizarBotaoFinalizarCompra();
    console.warn('Não foi possível verificar o login:', error.message);
  }
}

async function carregarEnderecosDaApi() {
  const select = document.getElementById('delivery-address');
  const headerSelect = document.getElementById('store-address-select');
  if (!select && !headerSelect) return;
  try {
    const response = await fetch(ADDRESSES_API, { credentials: 'include' });
    if (!response.ok) throw new Error('Endereços indisponíveis');
    const { addresses = [] } = await response.json();
    if (select) select.innerHTML = '<option value="">Selecione um endereço para continuar</option>';
    if (headerSelect) headerSelect.innerHTML = '<option value="">Selecione seu endereço</option>';
    addresses.forEach((address) => {
      const option = document.createElement('option');
      option.value = address.id;
      option.textContent = `${address.title} · ${address.street}`;
      option.dataset.address = [address.title, address.street, address.city].filter(Boolean).join(' | ');
      if (select) select.appendChild(option.cloneNode(true));
      if (headerSelect) headerSelect.appendChild(option);
    });
    const savedAddress = localStorage.getItem('hoje-delivery-address-id') || '';
    if (select && [...select.options].some((option) => option.value === savedAddress)) select.value = savedAddress;
    if (headerSelect && [...headerSelect.options].some((option) => option.value === savedAddress)) headerSelect.value = savedAddress;
    if (headerSelect && !headerSelect.dataset.bound) {
      headerSelect.addEventListener('change', () => {
        if (select) select.value = headerSelect.value;
        localStorage.setItem('hoje-delivery-address-id', headerSelect.value);
        updateAddressSummaryFromSelection();
      });
      headerSelect.dataset.bound = 'true';
    }
    updateAddressSummaryFromSelection();
  } catch (error) {
    console.warn('Endereços cadastrados indisponíveis:', error.message);
  }
}

function updateAddressSummaryFromSelection() {
  const select = document.getElementById('delivery-address');
  const headerSelect = document.getElementById('store-address-select');
  const selectedValue = select?.value || headerSelect?.value || '';
  if (select) select.value = selectedValue;
  if (headerSelect) headerSelect.value = selectedValue;
}

function atualizarBotaoFinalizarCompra() {
  const button = document.getElementById('finalizar-compra');
  if (!button) return;
  button.textContent = sessaoLoja.authenticated ? 'Finalizar Compra' : 'Fazer login';
  button.dataset.loginRequired = String(!sessaoLoja.authenticated);
}

function obterDadosFavorito(card) {
  const nome = card.querySelector('.product-name')?.textContent.trim() || 'Produto';
  const priceElement = card.querySelector('.product-price')?.cloneNode(true);
  priceElement?.querySelector('.old-price')?.remove();

  return {
    name: nome,
    category: card.querySelector('.product-category')?.textContent.trim() || inferirCategoria(nome),
    price: priceElement?.textContent.trim() || 'R$ 0,00',
    image: card.querySelector('.product-img')?.getAttribute('src') || '',
    saleUnit: produtoVendidoPorKg(card) ? 'Quilograma' : 'Unidade',
  };
}

async function sincronizarFavorito(card, button) {
  if (!sessaoLoja.authenticated) {
    abrirLoginDashboard();
    return;
  }

  const favorite = obterDadosFavorito(card);
  const ativo = button.classList.toggle('is-favorite');
  button.setAttribute('aria-pressed', String(ativo));
  button.setAttribute('aria-label', ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');

  try {
    const response = await fetch(FAVORITES_API, ativo
      ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ favorite }) }
      : { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ name: favorite.name }) });

    if (!response.ok) throw new Error('Não foi possível sincronizar o favorito.');
  } catch (error) {
    button.classList.toggle('is-favorite', !ativo);
    button.setAttribute('aria-pressed', String(!ativo));
    console.error(error);
  }

  atualizarContadorFavoritos();
}

function formatarPreco(valor) {
  return 'R$ ' + valor.toFixed(2).replace('.', ',');
}

function produtoVendidoPorKg(card) {
  return card?.dataset.saleUnit === 'Quilograma';
}

function formatarQuantidade(quantidade, porKg) {
  if (!porKg) return String(Math.max(1, Math.trunc(Number(quantidade) || 1)));
  const gramas = Math.round((Number(quantidade) || 0.1) * 1000);
  if (gramas < 1000) return `${gramas} g`;
  return `${(gramas / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

function lerQuantidade(card) {
  const span = card?.querySelector('.qty');
  const quantidade = Number(span?.dataset.quantity);
  if (Number.isFinite(quantidade) && quantidade > 0) return quantidade;
  const textQuantity = Number(String(span?.textContent || '').replace(',', '.'));
  return Number.isFinite(textQuantity) && textQuantity > 0 ? textQuantity : (produtoVendidoPorKg(card) ? 0.1 : 1);
}

function definirQuantidade(card, quantidade) {
  const span = card?.querySelector('.qty');
  if (!span) return;
  const normalizada = produtoVendidoPorKg(card)
    ? Math.max(0.1, Math.round(quantidade * 10) / 10)
    : Math.max(1, Math.trunc(quantidade));
  span.dataset.quantity = String(normalizada);
  span.textContent = formatarQuantidade(normalizada, produtoVendidoPorKg(card));
}

function obterPrecoProduto(card) {
  const precoEl = card.querySelector('.product-price')?.cloneNode(true);
  if (!precoEl) return 0;

  const precoAntigo = precoEl.querySelector('.old-price');
  if (precoAntigo) precoAntigo.remove();

  const match = precoEl.textContent.match(/([\d.,]+)/);
  return match ? parseFloat(match[1].replace(/\./g, '').replace(',', '.')) : 0;
}

function inferirCategoria(nome) {
  const texto = nome.toLowerCase();

  if (texto.includes('banana') || texto.includes('maçã') || texto.includes('uva') || texto.includes('laranja') || texto.includes('morango') || texto.includes('tomate') || texto.includes('alface') || texto.includes('frutas')) {
    return 'Frutas & Verduras';
  }

  if (texto.includes('leite') || texto.includes('queijo') || texto.includes('iogurte') || texto.includes('latic')) {
    return 'Laticínios';
  }

  if (texto.includes('coca') || texto.includes('refrigerante') || texto.includes('suco') || texto.includes('bebida')) {
    return 'Bebidas';
  }

  if (texto.includes('arroz') || texto.includes('feijão') || texto.includes('macarrão') || texto.includes('açúcar') || texto.includes('farinha') || texto.includes('tempero')) {
    return 'Mercearia';
  }

  if (texto.includes('pão') || texto.includes('bolacha') || texto.includes('biscoito') || texto.includes('padaria')) {
    return 'Padaria';
  }

  return 'Produtos';
}

function abrirCarrinho() {
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');

  if (cartPanel) cartPanel.classList.add('open');
  if (cartBackdrop) cartBackdrop.classList.add('open');
}

function fecharCarrinho() {
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');

  if (cartPanel) cartPanel.classList.remove('open');
  if (cartBackdrop) cartBackdrop.classList.remove('open');
}

function renderizarCarrinho(persistir = true) {
  const cartItems = document.getElementById('cart-items');
  const cartTitle = document.getElementById('cart-panel-title');
  const cartPanelTotal = document.getElementById('cart-panel-total');
  const badge = document.getElementById('cart-badge');
  const totalEl = document.getElementById('cart-total');
  const couponInput = document.getElementById('coupon-input');
  const couponValue = (couponInput?.value || '').trim().toUpperCase();
  const descontoPercentual = cupomAplicado.codigo === couponValue ? cupomAplicado.percentual / 100 : 0;

  const itensPorProduto = new Map(carrinhoItens.map((item) => [normalizarCatalogo(item.nome), item]));
  const nomesVisiveis = new Set();
  let totalItens = 0;
  let totalPreco = 0;

  document.querySelectorAll('.product-card').forEach(card => {
    const nome = card.querySelector('.product-name')?.textContent.trim() || 'Produto';
    const chaveProduto = normalizarCatalogo(nome);
    if (nomesVisiveis.has(chaveProduto)) return;
    nomesVisiveis.add(chaveProduto);
    const qtyControls = card.querySelector('.qty-controls');
    const qtyEl = card.querySelector('.qty');

    if (!qtyControls || !qtyEl) return;
    if (!qtyControls.classList.contains('show')) {
      itensPorProduto.delete(chaveProduto);
      return;
    }

    const qty = lerQuantidade(card);
    const preco = obterPrecoProduto(card);
    const imagem = card.querySelector('.product-img')?.src || '';
    const saleUnit = produtoVendidoPorKg(card) ? 'Quilograma' : 'Unidade';
    itensPorProduto.set(chaveProduto, {
      id: card.dataset.id || nome,
      nome,
      categoria: inferirCategoria(nome),
      qty,
      preco,
      imagem,
      saleUnit,
      card
    });
  });
  carrinhoItens = [...itensPorProduto.values()].map(normalizarItemCarrinho);
  const itens = [...itensPorProduto.values()];
  itens.forEach((item) => {
    totalItens += item.saleUnit === 'Quilograma' ? 1 : item.qty;
    totalPreco += item.qty * item.preco;
  });

  if (badge) badge.textContent = String(totalItens);
  if (totalEl) totalEl.textContent = formatarPreco(totalPreco);
  if (cartPanelTotal) cartPanelTotal.textContent = formatarPreco(totalPreco);

  if (cartTitle) {
    const textoItens = totalItens === 1 ? 'item' : 'itens';
    cartTitle.textContent = `Meu Carrinho (${totalItens} ${textoItens})`;
  }

  const summaryEl = document.querySelector('.cart-summary-box');

  const desconto = totalPreco * descontoPercentual;
  const totalComDesconto = Math.max(0, totalPreco - desconto);

  if (!itens.length) {
    cartItems.innerHTML = '<div class="cart-empty">Seu carrinho está vazio.</div>';
    if (summaryEl) summaryEl.innerHTML = `
      <div class="summary-row"><span>Subtotal (0 itens)</span><strong>R$ 0,00</strong></div>
      <div class="summary-row"><span>Descontos</span><strong>R$ 0,00</strong></div>
      <div class="summary-row"><span>Frete</span><strong>R$ 0,00</strong></div>
      <div class="summary-row total"><span>Total</span><strong>R$ 0,00</strong></div>
    `;
    if (persistir) sincronizarCarrinhoApi([]);
    return;
  }

  cartItems.innerHTML = itens.map(item => `
    <div class="cart-item" data-name="${item.nome}">
      <div class="cart-item-thumb">
        ${item.imagem ? `<img src="${item.imagem}" alt="${item.nome}">` : '<div class="cart-thumb-placeholder"></div>'}
      </div>

      <div class="cart-item-info">
        <div class="cart-item-name">${item.nome}</div>
        <div class="cart-item-category">${item.saleUnit === 'Quilograma' ? `${item.categoria} · ${formatarPreco(item.preco)}/kg` : item.categoria}</div>
        <div class="cart-item-price">${formatarPreco(item.preco * item.qty)}</div>
      </div>

      <div class="cart-item-controls">
        <button class="qty-minus" data-action="decrement" data-name="${item.nome}" aria-label="Diminuir quantidade">−</button>
        <span class="cart-item-qty">${formatarQuantidade(item.qty, item.saleUnit === 'Quilograma')}</span>
        <button class="qty-plus" data-action="increment" data-name="${item.nome}" aria-label="Aumentar quantidade">+</button>
      </div>

      <button class="cart-item-remove" data-action="remove" data-name="${item.nome}" aria-label="Remover item">
        <i data-lucide="trash-2"></i>
      </button>
    </div>
  `).join('');

  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="summary-row"><span>Subtotal (${totalItens} itens)</span><strong>${formatarPreco(totalPreco)}</strong></div>
      <div class="summary-row"><span>Descontos</span><strong>${formatarPreco(desconto)}</strong></div>
      <div class="summary-row"><span>Frete</span><strong>R$ 0,00</strong></div>
      <div class="summary-row total"><span>Total</span><strong>${formatarPreco(totalComDesconto)}</strong></div>
    `;
  }

  if (cartPanelTotal) {
    cartPanelTotal.textContent = formatarPreco(totalComDesconto);
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  if (persistir) sincronizarCarrinhoApi(itens);
}

function limparCarrinho() {
  carrinhoRevision += 1;
  carrinhoItens = [];
  const couponInput = document.getElementById('coupon-input');
  const feedback = document.getElementById('coupon-feedback');

  if (couponInput) couponInput.value = '';
  cupomAplicado = { codigo: '', percentual: 0 };
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'coupon-feedback';
  }

  document.querySelectorAll('.product-card').forEach(card => {
    const qtyControls = card.querySelector('.qty-controls');
    const qtySpan = card.querySelector('.qty');
    const comprarBtn = card.querySelector('.btn-comprar');

    if (!qtyControls || !qtySpan || !comprarBtn) return;

    definirQuantidade(card, produtoVendidoPorKg(card) ? 0.1 : 1);
    qtyControls.classList.remove('show');
    comprarBtn.style.display = 'block';
  });

  renderizarCarrinho();
}

function ajustarQuantidadeProduto(nome, operacao) {
  carrinhoRevision += 1;
  let productCardFound = false;
  document.querySelectorAll('.product-card').forEach(card => {
    const itemNome = card.querySelector('.product-name')?.textContent.trim();
    if (normalizarCatalogo(itemNome) !== normalizarCatalogo(nome)) return;
    productCardFound = true;

    const qtyControls = card.querySelector('.qty-controls');
    const qtySpan = card.querySelector('.qty');
    const comprarBtn = card.querySelector('.btn-comprar');

    if (!qtyControls || !qtySpan || !comprarBtn) return;

    const atual = lerQuantidade(card);
    const passo = produtoVendidoPorKg(card) ? 0.1 : 1;
    const proximo = Math.round((operacao === 'increment' ? atual + passo : atual - passo) * 10) / 10;

    definirQuantidade(card, Math.max(passo, proximo));
  });
  if (!productCardFound) {
    const item = carrinhoItens.find((cartItem) => normalizarCatalogo(cartItem.nome) === normalizarCatalogo(nome));
    if (item) item.qty = Math.max(item.saleUnit === 'Quilograma' ? 0.1 : 1, item.qty + (operacao === 'increment' ? 1 : -1) * (item.saleUnit === 'Quilograma' ? 0.1 : 1));
  }

  renderizarCarrinho();
}

// Chamada quando clica em "Comprar"
function adicionarProduto(botao) {
  const card = botao.closest('.product-card');
  if (!card) return;

  const nome = card.querySelector('.product-name')?.textContent.trim();
  if (!nome) return;
  carrinhoRevision += 1;
  const quantidade = lerQuantidade(card);
  document.querySelectorAll('.product-card').forEach((productCard) => {
    if (normalizarCatalogo(productCard.querySelector('.product-name')?.textContent.trim()) !== normalizarCatalogo(nome)) return;
    const qtyControls = productCard.querySelector('.qty-controls');
    const comprarBtn = productCard.querySelector('.btn-comprar');
    if (!qtyControls || !comprarBtn) return;
    definirQuantidade(productCard, quantidade);
    qtyControls.classList.add('show');
    comprarBtn.style.display = 'none';
  });
  const badge = document.getElementById('cart-badge');

  card.classList.remove('is-added');
  void card.offsetWidth;
  card.classList.add('is-added');

  if (badge) {
    badge.classList.remove('pulse');
    void badge.offsetWidth;
    badge.classList.add('pulse');
  }

  renderizarCarrinho();
  abrirCarrinho();
}

// Chamada quando clica no "+"
function aumentarQtd(botao) {
  const card = botao.closest('.product-card');
  if (!card) return;

  const nome = card.querySelector('.product-name')?.textContent.trim();
  if (!nome) return;
  carrinhoRevision += 1;
  const passo = produtoVendidoPorKg(card) ? 0.1 : 1;
  const quantidade = lerQuantidade(card) + passo;
  document.querySelectorAll('.product-card').forEach((productCard) => {
    if (normalizarCatalogo(productCard.querySelector('.product-name')?.textContent.trim()) === normalizarCatalogo(nome)) {
      definirQuantidade(productCard, quantidade);
    }
  });
  renderizarCarrinho();
}

// Chamada quando clica na lixeira
function removerProduto(botao) {
  const card = botao.closest('.product-card');
  if (!card) return;

  const nome = card.querySelector('.product-name')?.textContent.trim();
  if (!nome) return;
  carrinhoRevision += 1;
  carrinhoItens = carrinhoItens.filter((item) => normalizarCatalogo(item.nome) !== normalizarCatalogo(nome));
  document.querySelectorAll('.product-card').forEach((productCard) => {
    if (normalizarCatalogo(productCard.querySelector('.product-name')?.textContent.trim()) !== normalizarCatalogo(nome)) return;
    const qtyControls = productCard.querySelector('.qty-controls');
    const comprarBtn = productCard.querySelector('.btn-comprar');
    if (!qtyControls || !comprarBtn) return;
    definirQuantidade(productCard, produtoVendidoPorKg(productCard) ? 0.1 : 1);
    qtyControls.classList.remove('show');
    comprarBtn.style.display = 'block';
  });
  renderizarCarrinho();
}

// Adiciona automaticamente o botão de favoritar (coração) em
// qualquer .product-card que ainda não tenha um
function adicionarBotoesFavorito() {
  document.querySelectorAll('.product-card').forEach(card => {
    let btn = card.querySelector('.fav-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'fav-btn';
      btn.innerHTML = '<i data-lucide="heart"></i>';
      card.prepend(btn);
    }

    btn.type = 'button';
    btn.disabled = true;
    btn.setAttribute('aria-label', 'Adicionar aos favoritos');
    btn.setAttribute('aria-pressed', 'false');
    if (!btn.dataset.favoriteBound) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sincronizarFavorito(card, btn);
      });
      btn.dataset.favoriteBound = 'true';
    }
  });

  carregarFavoritosDaApi();
}

async function carregarFavoritosDaApi() {
  try {
    const response = await fetch(FAVORITES_API, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    const favoritos = new Set((data.favorites || []).map((item) => item.name));

    const favoritesElement = document.getElementById('store-favorites-count');
    if (favoritesElement) favoritesElement.textContent = `${favoritos.size} ${favoritos.size === 1 ? 'item' : 'itens'}`;

    document.querySelectorAll('.product-card').forEach((card) => {
      const nome = card.querySelector('.product-name')?.textContent.trim();
      const button = card.querySelector('.fav-btn');
      if (!button) return;
      const ativo = favoritos.has(nome);
      button.classList.toggle('is-favorite', ativo);
      button.setAttribute('aria-pressed', String(ativo));
      button.setAttribute('aria-label', ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    });
  } catch (error) {
    console.warn('Dashboard de favoritos indisponível:', error.message);
  }
}

async function atualizarContadorFavoritos() {
  if (sessaoLoja.authenticated) await carregarFavoritosDaApi();
}

function adicionarCategoriasProdutos() {
  document.querySelectorAll('.product-card').forEach(card => {
    const nomeEl = card.querySelector('.product-name');
    if (!nomeEl || card.querySelector('.product-category')) return;

    const nome = (nomeEl.textContent || '').toLowerCase();
    let categoria = 'Produtos';

    if (nome.includes('banana') || nome.includes('maçã') || nome.includes('maça') || nome.includes('tomate') || nome.includes('alface') || nome.includes('cenoura') || nome.includes('batata') || nome.includes('laranja') || nome.includes('uva') || nome.includes('morango') || nome.includes('fruta')) {
      categoria = 'Frutas & Verduras';
    } else if (nome.includes('leite') || nome.includes('queijo') || nome.includes('iogurte') || nome.includes('latic')) {
      categoria = 'Laticínios';
    } else if (nome.includes('coca') || nome.includes('refrigerante') || nome.includes('suco') || nome.includes('bebida') || nome.includes('cerveja') || nome.includes('vinho')) {
      categoria = 'Bebidas';
    } else if (nome.includes('arroz') || nome.includes('feijão') || nome.includes('macarrão') || nome.includes('farinha') || nome.includes('açúcar') || nome.includes('molho')) {
      categoria = 'Mercearia';
    } else if (nome.includes('detergente') || nome.includes('sabão') || nome.includes('amaciante') || nome.includes('veja') || nome.includes('omo') || nome.includes('limpeza') || nome.includes('água sanitária')) {
      categoria = 'Limpeza';
    } else if (nome.includes('ração') || nome.includes('pet') || nome.includes('cachorro') || nome.includes('gato')) {
      categoria = 'Pet Shop';
    } else if (nome.includes('café') || nome.includes('pão') || nome.includes('bolacha') || nome.includes('padaria')) {
      categoria = 'Padaria';
    } else if (nome.includes('carne') || nome.includes('frango') || nome.includes('bovino') || nome.includes('salsicha')) {
      categoria = 'Carnes';
    }

    const categoriaEl = document.createElement('div');
    categoriaEl.className = 'product-category';
    categoriaEl.textContent = categoria;

    nomeEl.before(categoriaEl);
  });
}

function abrirLoginDashboard() {
  const returnUrl = encodeURIComponent(window.location.href);
  const url = sessaoLoja.authenticated
    ? '/dashboard'
    : `/login?callbackUrl=${returnUrl}`;
  window.location.href = url;
}

function inicializarCarrinho() {
  const cartTrigger = document.getElementById('cart-trigger');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartClose = document.getElementById('cart-close');
  const limparCarrinhoBtn = document.getElementById('limpar-carrinho');
  const cartItems = document.getElementById('cart-items');
  const loginTrigger = document.getElementById('login-trigger');
  const couponInput = document.getElementById('coupon-input');
  const applyCouponBtn = document.getElementById('apply-coupon');
  const feedback = document.getElementById('coupon-feedback');
  const deliveryAddress = document.getElementById('delivery-address');
  const finalizeButton = document.getElementById('finalizar-compra');
  const locationSummary = document.getElementById('location-summary');

  const updateAddressSummary = () => {
    const selected = deliveryAddress?.selectedOptions[0];
    const headerSelect = document.getElementById('store-address-select');
    if (headerSelect) headerSelect.value = selected?.value || '';
    if (locationSummary) locationSummary.setAttribute('aria-label', selected?.value ? selected.textContent : 'Selecione seu endereço');
  };

  if (deliveryAddress) {
    deliveryAddress.value = localStorage.getItem('hoje-delivery-address-id') || '';
    deliveryAddress.addEventListener('change', () => {
      localStorage.setItem('hoje-delivery-address-id', deliveryAddress.value);
      updateAddressSummary();
    });
    updateAddressSummary();
  }

  if (finalizeButton) {
    finalizeButton.addEventListener('click', async () => {
      if (!sessaoLoja.authenticated) {
        abrirLoginDashboard();
        return;
      }

      if (!deliveryAddress?.value) {
        if (feedback) {
          feedback.textContent = 'Selecione um endereço de entrega antes de finalizar.';
          feedback.className = 'coupon-feedback error';
        }
        deliveryAddress?.focus();
        return;
      }

      const items = carrinhoItens.map((item) => ({
        name: item.nome,
        quantity: item.qty,
        unit: item.saleUnit === 'Quilograma' ? 'kg' : 'unidade',
        price: formatarPreco(item.preco),
      }));

      if (!items.length) {
        if (feedback) { feedback.textContent = 'Adicione ao menos um produto antes de finalizar.'; feedback.className = 'coupon-feedback error'; }
        return;
      }

      const couponCode = couponInput?.value.trim().toUpperCase() || '';
      if (couponCode && cupomAplicado.codigo !== couponCode) {
        if (feedback) { feedback.textContent = 'Aplique e valide seu cupom antes de finalizar a compra.'; feedback.className = 'coupon-feedback error'; }
        return;
      }

      try {
        const paymentSelect = document.getElementById('payment-method');
        const paymentMethod = PAYMENT_METHODS.includes(paymentSelect?.value) ? paymentSelect.value : 'outro';
        const response = await fetch('/api/erp/orders', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ items, address: deliveryAddress.selectedOptions[0].textContent, paymentMethod, couponCode }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o pedido.');
        limparCarrinho();
        if (feedback) { feedback.textContent = 'Pedido registrado com sucesso.'; feedback.className = 'coupon-feedback success'; }
      } catch (error) {
        if (feedback) { feedback.textContent = error.message; feedback.className = 'coupon-feedback error'; }
      }
    });
  }

  if (loginTrigger) {
    loginTrigger.addEventListener('click', abrirLoginDashboard);
    loginTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        abrirLoginDashboard();
      }
    });
  }

  carregarSessaoDaLoja();
  window.setInterval(() => {
    if (document.visibilityState === 'visible' && sessaoLoja.authenticated) carregarCarrinhoDaApi();
  }, 3000);

  const atualizarSessaoAoVoltar = () => {
    if (document.visibilityState === 'visible') carregarSessaoDaLoja();
  };

  document.addEventListener('visibilitychange', atualizarSessaoAoVoltar);
  window.addEventListener('pageshow', atualizarSessaoAoVoltar);
  window.setInterval(carregarSessaoDaLoja, 15000);

  if (cartTrigger) {
    cartTrigger.addEventListener('click', abrirCarrinho);
  }

  if (cartBackdrop) {
    cartBackdrop.addEventListener('click', fecharCarrinho);
  }

  if (cartClose) {
    cartClose.addEventListener('click', fecharCarrinho);
  }

  if (limparCarrinhoBtn) {
    limparCarrinhoBtn.addEventListener('click', limparCarrinho);
  }

  if (applyCouponBtn && couponInput) {
    applyCouponBtn.addEventListener('click', async () => {
      const valor = couponInput.value.trim().toUpperCase();
      cupomAplicado = { codigo: '', percentual: 0 };
      if (!valor) {
        if (feedback) {
          feedback.textContent = 'Informe o código de um cupom enviado para sua conta.';
          feedback.className = 'coupon-feedback error';
        }
        renderizarCarrinho();
        return;
      }

      if (!sessaoLoja.authenticated) {
        if (feedback) {
          feedback.textContent = 'Entre na sua conta para validar os cupons enviados para você.';
          feedback.className = 'coupon-feedback error';
        }
        renderizarCarrinho();
        return;
      }

      applyCouponBtn.disabled = true;
      try {
        const response = await fetch('/api/coupons', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível validar seus cupons.');
        const assignedCoupon = (data.coupons || []).find((item) => item.code === valor);
        if (!assignedCoupon) throw new Error('Cupom inválido, expirado ou não enviado para sua conta.');

        cupomAplicado = { codigo: valor, percentual: assignedCoupon.discountPercent };
        if (feedback) {
          feedback.textContent = `Cupom ${valor} aplicado: ${assignedCoupon.discountPercent}% de desconto.`;
          feedback.className = 'coupon-feedback success';
        }
      } catch (error) {
        if (feedback) {
          feedback.textContent = error.message;
          feedback.className = 'coupon-feedback error';
        }
      } finally {
        applyCouponBtn.disabled = false;
        renderizarCarrinho();
      }
    });

    couponInput.addEventListener('input', () => {
      if (couponInput.value.trim().toUpperCase() !== cupomAplicado.codigo) {
        cupomAplicado = { codigo: '', percentual: 0 };
        if (feedback) {
          feedback.textContent = '';
          feedback.className = 'coupon-feedback';
        }
        renderizarCarrinho();
      }
    });

    couponInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyCouponBtn.click();
      }
    });
  }

  if (cartItems) {
    cartItems.addEventListener('click', (event) => {
      const target = event.target.closest('button');
      if (!target) return;

      const action = target.dataset.action;
      const nome = target.dataset.name;

      if (!nome) return;

      if (action === 'increment') {
        ajustarQuantidadeProduto(nome, 'increment');
      }

      if (action === 'decrement') {
        ajustarQuantidadeProduto(nome, 'decrement');
      }

      if (action === 'remove') {
        carrinhoRevision += 1;
        carrinhoItens = carrinhoItens.filter((item) => normalizarCatalogo(item.nome) !== normalizarCatalogo(nome));
        document.querySelectorAll('.product-card').forEach(card => {
          const itemNome = card.querySelector('.product-name')?.textContent.trim();
          if (normalizarCatalogo(itemNome) !== normalizarCatalogo(nome)) return;

          const qtyControls = card.querySelector('.qty-controls');
          const qtySpan = card.querySelector('.qty');
          const comprarBtn = card.querySelector('.btn-comprar');

          if (!qtyControls || !qtySpan || !comprarBtn) return;

          definirQuantidade(card, produtoVendidoPorKg(card) ? 0.1 : 1);
          qtyControls.classList.remove('show');
          comprarBtn.style.display = 'block';
        });

        renderizarCarrinho();
      }
    });
  }

  renderizarCarrinho();
}

// Recalcula o total de itens e o valor total do carrinho,
// somando todos os produtos que já foram "comprados" na página
function atualizarCarrinho() {
  renderizarCarrinho();
}

function normalizarCatalogo(valor) {
  return String(valor || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function categoriaDoCarrossel(container) {
  const heading = container.closest('section')?.querySelector('h2, h3')?.textContent || '';
  const title = normalizarCatalogo(heading);
  if (title.includes('ofertas em destaque') || title.includes('mais vendidos')) return 'mais vendidos';
  if (title.includes('produtos de lavar roupa')) return 'lavanderia';
  if (title.includes('cervejas')) return 'cervejas';
  if (title.includes('acougue')) return 'acougue';
  const categories = ['hortifruti', 'acougue', 'carnes', 'padaria', 'laticinios', 'mercearia', 'bomboniere', 'sucos e refrigerantes', 'bebidas', 'bebidas alcoolicas', 'cervejas', 'vinhos', 'produtos de limpeza', 'limpeza', 'lavanderia', 'higiene pessoal', 'pet shop', 'bebes'];
  return categories.find((category) => title.includes(category));
}

function criarCardDoCatalogo(product) {
  const salePrice = Number(product.salePrice ?? product.price);
  const porKg = product.saleUnit === 'Quilograma';
  const price = `R$ ${salePrice.toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}`;
  const oldPrice = Number(product.discount) > 0 ? ` <span class="old-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}${porKg ? ' / kg' : ''}</span>` : '';
  return `<article class="product-card" data-id="${product.id}" data-sale-unit="${porKg ? 'Quilograma' : 'Unidade'}"><img src="${product.image || ''}" alt="${product.title}" class="product-img"><div class="product-name">${product.title}</div><div class="product-price">${price}${oldPrice}</div><div class="product-rating">${product.subcategory || product.categories.join(', ')}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Adicionar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)"><i data-lucide="trash-2"></i></button><span class="qty" data-quantity="${porKg ? '0.1' : '1'}">${porKg ? '100 g' : '1'}</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`;
}

async function carregarCatalogoReal() {
  try {
    const carrossels = [...document.querySelectorAll('.offers-grid, .highlight-products, .products-grid, .carousel-track')];
    carrossels.forEach((container) => { container.innerHTML = ''; });
    const response = await fetch('/api/products');
    if (!response.ok) return;
    const { products = [] } = await response.json();
    carrossels.forEach((container) => {
      const category = categoriaDoCarrossel(container);
      const isSalesCarousel = category === 'mais vendidos';
      const heading = normalizarCatalogo(container.closest('section')?.querySelector('h2, h3')?.textContent || '');
      const visibleProducts = isSalesCarousel
        ? products.filter((product) => Number(product.salesCount) > 0).sort((first, second) => second.salesCount - first.salesCount)
        : products.filter((product) => {
          const hasCategory = category && product.categories?.some((item) => normalizarCatalogo(item) === category);
          return hasCategory;
        });
      container.innerHTML = visibleProducts.map(criarCardDoCatalogo).join('');
    });
    adicionarCategoriasProdutos();
    adicionarBotoesFavorito();
    carregarCarrinhoDaApi();
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    console.warn('Catálogo real indisponível:', error.message);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  inicializarCarrinho();
  adicionarBotoesFavorito();
  adicionarCategoriasProdutos();
  carregarCatalogoReal();
  carregarCarrinhoDaApi();
  const buscaInicial = new URLSearchParams(window.location.search).get('busca');
  if (buscaInicial) {
    const input = document.getElementById('search-input');
    if (input) {
      input.value = buscaInicial;
      buscarProdutos();
      input.focus();
    }
  }
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function normalizarBusca(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Build an index of products (name, category, card) to speed searches and avoid querying DOM each keystroke
let _productIndex = [];
let _searchDebounceTimer = null;

function buildProductIndex() {
  _productIndex = [...document.querySelectorAll('.product-card')].map((card) => {
    const nome = card.querySelector('.product-name')?.textContent.trim() || '';
    const categoria = card.querySelector('.product-category')?.textContent.trim() || '';
    return { name: nome, nameNormalized: normalizarBusca(nome), category: categoria, categoryNormalized: normalizarBusca(categoria), card };
  });
}

function scheduleBuscarProdutos() {
  clearTimeout(_searchDebounceTimer);
  _searchDebounceTimer = setTimeout(buscarProdutos, 180);
}

// Atualiza os resultados da busca da loja conforme o usuário digita.
function buscarProdutos() {
  const input = document.getElementById('search-input');
  const resultsBox = document.getElementById('search-results');
  if (!input || !resultsBox) return;

  const termo = normalizarBusca(input.value.trim());
  resultsBox.innerHTML = '';

  if (!termo) {
    resultsBox.classList.remove('show');
    return;
  }

  // Use the indexed list for faster filtering
  const encontrados = [];
  const vistos = new Set();
  for (let i = 0; i < _productIndex.length && encontrados.length < 8; i += 1) {
    const item = _productIndex[i];
    const name = item.nameNormalized;
    const cat = item.categoryNormalized;
    if ((name.includes(termo) || cat.includes(termo)) && !vistos.has(name)) {
      vistos.add(name);
      encontrados.push(item);
    }
  }

  if (!encontrados.length) {
    resultsBox.innerHTML = `
      <div class="search-empty">
        <i data-lucide="search-x"></i>
        <strong>Nenhum produto encontrado</strong>
        <span>Tente buscar por outro nome ou categoria.</span>
      </div>
    `;
    resultsBox.classList.add('show');
  } else {
    encontrados.forEach(({ card, name }) => {
      const nomeOriginal = name;
      const item = document.createElement('div');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.className = 'search-result-item';
      item.dataset.productName = nomeOriginal;

      const imagem = card.querySelector('.product-img')?.getAttribute('src');
      const categoria = card.querySelector('.product-category')?.textContent.trim() || inferirCategoria(nomeOriginal);
      const preco = card.querySelector('.product-price')?.textContent.trim() || '';

      item.innerHTML = `
        <span class="search-result-image">${imagem ? `<img src="${imagem}" alt="">` : '<i data-lucide="shopping-bag"></i>'}</span>
        <span class="search-result-info"><strong>${nomeOriginal}</strong><small>${categoria}</small></span>
        <span class="search-result-price">${preco}</span>
        <span class="search-result-actions">
          <button type="button" class="search-buy">Adicionar</button>
          <span class="search-qty-controls">
            <button type="button" class="search-qty-minus" aria-label="Diminuir quantidade">−</button>
            <strong class="search-qty-value">1</strong>
            <button type="button" class="search-qty-plus" aria-label="Aumentar quantidade">+</button>
          </span>
        </span>
        <i data-lucide="arrow-up-right" class="search-result-arrow"></i>
      `;

      const buyButton = item.querySelector('.search-buy');
      const qtyControls = item.querySelector('.search-qty-controls');
      const qtyValue = item.querySelector('.search-qty-value');

      const atualizarQuantidadeBusca = () => {
        const cardControls = card.querySelector('.qty-controls');
        const cardQuantity = card.querySelector('.qty');
        const ativo = cardControls?.classList.contains('show');
        buyButton.style.display = ativo ? 'none' : 'inline-flex';
        qtyControls.classList.toggle('show', ativo);
        qtyValue.textContent = cardQuantity?.textContent || '1';
      };

      buyButton.addEventListener('click', (event) => {
        event.stopPropagation();
        adicionarProduto(card.querySelector('.btn-comprar'));
        atualizarQuantidadeBusca();
      });

      item.querySelector('.search-qty-plus').addEventListener('click', (event) => {
        event.stopPropagation();
        aumentarQtd(card.querySelector('.btn-add'));
        atualizarQuantidadeBusca();
      });

      item.querySelector('.search-qty-minus').addEventListener('click', (event) => {
        event.stopPropagation();
        ajustarQuantidadeProduto(nomeOriginal, 'decrement');
        atualizarQuantidadeBusca();
      });

      atualizarQuantidadeBusca();

      item.addEventListener('click', (event) => {
        if (event.target.closest('.search-result-actions')) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('search-highlight');
        void card.offsetWidth;
        card.classList.add('search-highlight');
        input.value = nomeOriginal;
        resultsBox.classList.remove('show');
      });

      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });

      resultsBox.appendChild(item);

      const image = item.querySelector('img');
      if (image) {
        image.addEventListener('error', () => {
          image.remove();
          item.querySelector('.search-result-image')?.classList.add('is-missing');
        }, { once: true });
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
  resultsBox.classList.add('show');
}

// Hook in: replace inline handlers by scheduling the debounced search
(function replaceSearchListeners() {
  const input = document.getElementById('search-input');
  if (input) {
    // remove inline handlers if present
    input.removeAttribute('oninput');
    input.removeAttribute('onfocus');
    input.addEventListener('input', scheduleBuscarProdutos);
    input.addEventListener('focus', scheduleBuscarProdutos);
  }
})();

// Ensure index built after content populated
window.addEventListener('DOMContentLoaded', () => {
  buildProductIndex();
});

// Rebuild index when product catalog is (re)loaded
const origCarregarCatalogoReal = window.carregarCatalogoReal;
if (typeof origCarregarCatalogoReal === 'function') {
  window.carregarCatalogoReal = async function patchedCarregarCatalogoReal() {
    await origCarregarCatalogoReal();
    buildProductIndex();
  };
}

// Ensure first result activation on Enter still works (keeps previous behavior)
document.addEventListener('keydown', function(evento) {
  const input = document.getElementById('search-input');
  if (evento.key === 'Enter' && document.activeElement === input) {
    const primeiroResultado = document.querySelector('.search-result-item');
    if (primeiroResultado) {
      evento.preventDefault();
      primeiroResultado.click();
    }
  }
});

// END of search improvements

// --- Checkout: require profile/address before finalizing purchase ---
(function patchFinalizeFlow() {
  const finalizeButton = document.getElementById('finalizar-compra');
  if (!finalizeButton) return;

  finalizeButton.addEventListener('click', async (e) => {
    e.preventDefault();
    // existing logic starts here
    // check authentication
    if (!sessaoLoja.authenticated) {
      abrirLoginDashboard();
      return;
    }

    // check if user has addresses loaded (delivery-address select)
    const deliveryAddress = document.getElementById('delivery-address');
    const feedback = document.getElementById('coupon-feedback');
    if (!deliveryAddress || deliveryAddress.options.length <= 1 || !deliveryAddress.value) {
      if (feedback) {
        feedback.textContent = 'Complete seu perfil com um endereço antes de finalizar a compra.';
        feedback.className = 'coupon-feedback error';
      }
      // redirect user to profile page to add address
      setTimeout(() => { window.location.href = '/dashboard/profile'; }, 900);
      return;
    }

    // Otherwise, keep original finalize flow (simulate previous handler)
    // trigger original click behavior: locate original handler by dispatching a custom event
    // The page has an existing finalize handler attached in inicializarCarrinho; call it indirectly
    const event = new Event('hoje-finalize-click', { bubbles: true, cancelable: true });
    finalizeButton.dispatchEvent(event);
  });
})();

// Fecha o menu de busca se a pessoa clicar em qualquer lugar fora dele
document.addEventListener('click', function(evento) {
  const box = document.getElementById('search-results');
  const input = document.getElementById('search-input');
  if (box && !box.contains(evento.target) && evento.target !== input) {
    box.classList.remove('show');
  }
});

document.addEventListener('keydown', function(evento) {
  const input = document.getElementById('search-input');
  if (evento.key === 'Enter' && document.activeElement === input) {
    const primeiroResultado = document.querySelector('.search-result-item');
    if (primeiroResultado) {
      evento.preventDefault();
      primeiroResultado.click();
    }
  }
});