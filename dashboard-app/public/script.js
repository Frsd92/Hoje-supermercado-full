// Chamada toda vez que uma seta de carrossel (‹ ou ›) é clicada
function moveCarousel(botao, direcao) {
  const track = botao.parentElement.querySelector('.scroll-target');
  const distancia = 200;
  track.scrollBy({
    left: distancia * direcao,
    behavior: 'smooth'
  });
}

const CUPONS_VALIDOS = {
  HOJE10: 0.1,
  HOJE20: 0.2,
  PREMIUM: 0.15
};

const FAVORITES_API = '/api/favorites';
const CART_API = '/api/cart';
const SESSION_API = '/api/store-session';
const ADDRESSES_API = '/api/addresses';
const PAYMENT_METHODS = ['pix', 'cartao', 'dinheiro', 'outro'];
let sessaoLoja = { authenticated: false, user: null };
let carrinhoHidratado = false;
let carrinhoAtualizando = false;

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

async function sincronizarCarrinhoApi(itens) {
  if (!carrinhoHidratado) return;
  try {
    await fetch(CART_API, opcoesCarrinho({
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        cart: itens.map((item) => ({
          name: item.nome,
          category: item.categoria,
          price: formatarPreco(item.preco),
          image: item.imagem || '',
          quantity: item.qty,
        })),
      }),
    }));
  } catch (error) {
    console.warn('Não foi possível sincronizar o carrinho:', error.message);
  }
}

async function carregarCarrinhoDaApi() {
  if (carrinhoAtualizando) {
    carrinhoHidratado = true;
    return;
  }

  carrinhoAtualizando = true;
  try {
    const response = await fetch(CART_API, opcoesCarrinho());
    if (!response.ok) return;
    const { cart = [] } = await response.json();

    document.querySelectorAll('.product-card').forEach((card) => {
      const nome = card.querySelector('.product-name')?.textContent.trim();
      const item = cart.find((savedItem) => savedItem.name === nome);
      const controls = card.querySelector('.qty-controls');
      const quantity = card.querySelector('.qty');
      const buyButton = card.querySelector('.btn-comprar');
      if (!controls || !quantity || !buyButton) return;
      if (item) {
        quantity.textContent = String(item.quantity || 1);
        controls.classList.add('show');
        buyButton.style.display = 'none';
      } else {
        quantity.textContent = '1';
        controls.classList.remove('show');
        buyButton.style.display = 'block';
      }
    });

    carrinhoHidratado = true;
    renderizarCarrinho(false);
  } catch (error) {
    console.warn('Carrinho compartilhado indisponível:', error.message);
    carrinhoHidratado = true;
  } finally {
    carrinhoAtualizando = false;
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
  const descontoPercentual = CUPONS_VALIDOS[couponValue] || 0;

  const itens = [];
  let totalItens = 0;
  let totalPreco = 0;

  document.querySelectorAll('.product-card').forEach(card => {
    const qtyControls = card.querySelector('.qty-controls');
    const qtyEl = card.querySelector('.qty');

    if (!qtyControls || !qtyEl || !qtyControls.classList.contains('show')) return;

    const qty = parseInt(qtyEl.textContent || '1', 10);
    const nome = card.querySelector('.product-name')?.textContent.trim() || 'Produto';
    const preco = obterPrecoProduto(card);
    const imagem = card.querySelector('.product-img')?.src || '';

    totalItens += qty;
    totalPreco += qty * preco;

    itens.push({
      id: card.dataset.id || nome,
      nome,
      categoria: inferirCategoria(nome),
      qty,
      preco,
      imagem,
      card
    });
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
        <div class="cart-item-category">${item.categoria}</div>
        <div class="cart-item-price">${formatarPreco(item.preco * item.qty)}</div>
      </div>

      <div class="cart-item-controls">
        <button class="qty-minus" data-action="decrement" data-name="${item.nome}" aria-label="Diminuir quantidade">−</button>
        <span class="cart-item-qty">${item.qty}</span>
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
  const couponInput = document.getElementById('coupon-input');
  const feedback = document.getElementById('coupon-feedback');

  if (couponInput) couponInput.value = '';
  if (feedback) {
    feedback.textContent = '';
    feedback.className = 'coupon-feedback';
  }

  document.querySelectorAll('.product-card').forEach(card => {
    const qtyControls = card.querySelector('.qty-controls');
    const qtySpan = card.querySelector('.qty');
    const comprarBtn = card.querySelector('.btn-comprar');

    if (!qtyControls || !qtySpan || !comprarBtn) return;

    qtySpan.textContent = '1';
    qtyControls.classList.remove('show');
    comprarBtn.style.display = 'block';
  });

  renderizarCarrinho();
}

function ajustarQuantidadeProduto(nome, operacao) {
  document.querySelectorAll('.product-card').forEach(card => {
    const itemNome = card.querySelector('.product-name')?.textContent.trim();
    if (itemNome !== nome) return;

    const qtyControls = card.querySelector('.qty-controls');
    const qtySpan = card.querySelector('.qty');
    const comprarBtn = card.querySelector('.btn-comprar');

    if (!qtyControls || !qtySpan || !comprarBtn) return;

    const atual = parseInt(qtySpan.textContent || '1', 10);
    const proximo = operacao === 'increment' ? atual + 1 : atual - 1;

    if (proximo <= 0) {
      qtySpan.textContent = '1';
      qtyControls.classList.remove('show');
      comprarBtn.style.display = 'block';
    } else {
      qtySpan.textContent = String(proximo);
    }
  });

  renderizarCarrinho();
}

// Chamada quando clica em "Comprar"
function adicionarProduto(botao) {
  const card = botao.closest('.product-card');
  if (!card) return;

  const qtyControls = card.querySelector('.qty-controls');
  const qtySpan = card.querySelector('.qty');
  const comprarBtn = card.querySelector('.btn-comprar');
  const badge = document.getElementById('cart-badge');

  if (!qtyControls || !qtySpan || !comprarBtn) return;

  card.classList.remove('is-added');
  void card.offsetWidth;
  card.classList.add('is-added');

  comprarBtn.style.display = 'none';
  qtyControls.classList.add('show');

  if (!Number.isFinite(parseInt(qtySpan.textContent)) || parseInt(qtySpan.textContent) < 1) {
    qtySpan.textContent = '1';
  }

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

  const qtySpan = card.querySelector('.qty');
  if (!qtySpan) return;

  qtySpan.textContent = String(parseInt(qtySpan.textContent || '1', 10) + 1);
  renderizarCarrinho();
}

// Chamada quando clica na lixeira
function removerProduto(botao) {
  const card = botao.closest('.product-card');
  if (!card) return;

  const qtyControls = card.querySelector('.qty-controls');
  const qtySpan = card.querySelector('.qty');
  const comprarBtn = card.querySelector('.btn-comprar');

  if (!qtyControls || !qtySpan || !comprarBtn) return;

  qtySpan.textContent = '1';
  qtyControls.classList.remove('show');
  comprarBtn.style.display = 'block';
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

      const items = [...document.querySelectorAll('.product-card')].flatMap((card) => {
        const controls = card.querySelector('.qty-controls');
        if (!controls?.classList.contains('show')) return [];
        return [{ name: card.querySelector('.product-name')?.textContent.trim(), quantity: Number(card.querySelector('.qty')?.textContent || 1), price: card.querySelector('.product-price')?.textContent.trim() || '' }];
      });

      if (!items.length) {
        if (feedback) { feedback.textContent = 'Adicione ao menos um produto antes de finalizar.'; feedback.className = 'coupon-feedback error'; }
        return;
      }

      try {
        const paymentSelect = document.getElementById('payment-method');
        const paymentMethod = PAYMENT_METHODS.includes(paymentSelect?.value) ? paymentSelect.value : 'outro';
        const response = await fetch('/api/erp/orders', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ items, address: deliveryAddress.selectedOptions[0].textContent, paymentMethod, total: document.getElementById('cart-total')?.textContent || 'R$ 0,00' }) });
        if (!response.ok) throw new Error('Não foi possível registrar o pedido.');
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
    applyCouponBtn.addEventListener('click', () => {
      const valor = couponInput.value.trim().toUpperCase();

      if (CUPONS_VALIDOS[valor]) {
        if (feedback) {
          feedback.textContent = `Cupom ${valor} aplicado com sucesso!`;
          feedback.className = 'coupon-feedback success';
        }
      } else {
        if (feedback) {
          feedback.textContent = 'Cupom inválido. Tente: HOJE10, HOJE20 ou PREMIUM';
          feedback.className = 'coupon-feedback error';
        }
      }

      renderizarCarrinho();
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
        document.querySelectorAll('.product-card').forEach(card => {
          const itemNome = card.querySelector('.product-name')?.textContent.trim();
          if (itemNome !== nome) return;

          const qtyControls = card.querySelector('.qty-controls');
          const qtySpan = card.querySelector('.qty');
          const comprarBtn = card.querySelector('.btn-comprar');

          if (!qtyControls || !qtySpan || !comprarBtn) return;

          qtySpan.textContent = '1';
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
  const price = `R$ ${salePrice.toFixed(2).replace('.', ',')}`;
  const oldPrice = Number(product.discount) > 0 ? ` <span class="old-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</span>` : '';
  return `<article class="product-card"><img src="${product.image || ''}" alt="${product.title}" class="product-img"><div class="product-name">${product.title}</div><div class="product-price">${price}${oldPrice}</div><div class="product-rating">${product.subcategory || product.categories.join(', ')}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Comprar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)"><i data-lucide="trash-2"></i></button><span class="qty">1</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`;
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

  const vistos = new Set();
  const resultados = [];

  document.querySelectorAll('.product-card').forEach(card => {
    if (resultados.length >= 8) return;

    const nomeEl = card.querySelector('.product-name');
    if (!nomeEl) return;

    const nomeOriginal = nomeEl.textContent.trim();
    const nome = normalizarBusca(nomeOriginal);
    const categoria = normalizarBusca(card.querySelector('.product-category')?.textContent || '');
    if ((!nome.includes(termo) && !categoria.includes(termo)) || vistos.has(nome)) return;

    vistos.add(nome);
    resultados.push({ card, nomeOriginal });
  });

  if (!resultados.length) {
    resultsBox.innerHTML = `
      <div class="search-empty">
        <i data-lucide="search-x"></i>
        <strong>Nenhum produto encontrado</strong>
        <span>Tente buscar por outro nome ou categoria.</span>
      </div>
    `;
    resultsBox.classList.add('show');
  } else {
    resultados.forEach(({ card, nomeOriginal }) => {
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
          <button type="button" class="search-buy">Comprar</button>
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