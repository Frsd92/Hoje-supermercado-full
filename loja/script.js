// Chamada toda vez que uma seta de carrossel (‹ ou ›) é clicada
function moveCarousel(botao, direcao) {
  const track = botao.parentElement.querySelector('.scroll-target');
  const distancia = 200;
  track.scrollBy({
    left: distancia * direcao,
    behavior: 'smooth'
  });
}

function configurarSlidesBannerPrincipal(slides) {
  const banner = document.querySelector('.banner[data-store-layout="main-hero"]');
  const dots = banner?.querySelector('.banner-dots');
  if (!banner || !dots) return;

  const gradient = 'linear-gradient(90deg, rgba(7, 23, 15, 0.86), rgba(9, 34, 22, 0.58), rgba(10, 26, 18, 0.22))';
  const slideList = Array.isArray(slides) ? slides.filter((slide) => slide?.imageUrl) : [];
  dots.replaceChildren();

  if (!slideList.length) {
    dots.hidden = true;
    return;
  }

  let activeIndex = 0;
  let timer;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  banner.style.backgroundSize = 'cover, contain';
  banner.style.backgroundPosition = 'center';
  banner.style.backgroundRepeat = 'no-repeat';
  const buttons = slideList.map((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dot';
    button.setAttribute('aria-label', `Mostrar banner ${index + 1} de ${slideList.length}`);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      showSlide(index);
      restartTimer();
    });
    dots.append(button);
    return button;
  });

  const showSlide = (index) => {
    activeIndex = index;
    const imageUrl = new URL(slideList[index].imageUrl, window.location.origin).href;
    banner.style.backgroundImage = `${gradient}, url("${imageUrl}")`;
    buttons.forEach((button, buttonIndex) => {
      const active = buttonIndex === activeIndex;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const stopTimer = () => {
    window.clearInterval(timer);
    timer = undefined;
  };
  const startTimer = () => {
    stopTimer();
    if (slideList.length < 2 || prefersReducedMotion) return;
    timer = window.setInterval(() => showSlide((activeIndex + 1) % slideList.length), 6000);
  };
  const restartTimer = () => {
    stopTimer();
    if (!banner.matches(':hover') && !banner.contains(document.activeElement)) startTimer();
  };

  showSlide(0);
  dots.hidden = slideList.length < 2;
  if (slideList.length < 2) return;

  banner.addEventListener('mouseenter', stopTimer);
  banner.addEventListener('mouseleave', startTimer);
  banner.addEventListener('focusin', stopTimer);
  banner.addEventListener('focusout', (event) => {
    if (!banner.contains(event.relatedTarget)) startTimer();
  });
  startTimer();
}

const FAVORITES_API = '/api/favorites';
const CART_API = '/api/cart';
const SESSION_API = '/api/store-session';
const ADDRESSES_API = '/api/addresses';
const PAYMENT_METHODS = ['pix', 'cartao'];
let sessaoLoja = { authenticated: false, user: null };
let checkoutLojaEmAndamento = false;
let cartaoSalvoLoja = null;
let cartaoSalvoLojaEmail = '';
let estadoCartaoSalvoLoja = 'idle';
let erroCartaoSalvoLoja = '';
let promessaCartaoSalvoLoja = null;
let carrinhoHidratado = false;
let carrinhoAtualizando = false;
let carrinhoRevision = 0;
let carrinhoGravacoesPendentes = 0;
let filaGravacaoCarrinho = Promise.resolve();
let carrinhoItens = [];
let flashOfferCountdownTimer = null;
let flashOfferRefreshTimer = null;
let cupomAplicado = { codigo: '', percentual: 0 };
let tentativaCheckoutId = '';
let assinaturaTentativaCheckout = '';
let erroSessaoDaLoja = '';
let erroCarrinhoDaApi = '';
let erroEnderecosDaApi = '';
let enderecosDaLoja = [];
let favoritosLoja = new Set();
let toastCarrinhoTimer;

function chaveEnderecoEntregaDashboard() {
  return `hoje-dashboard-delivery-address-${sessaoLoja.user?.email || 'guest'}`;
}

function persistirEnderecoEntregaSelecionado(addressId) {
  const selectedId = String(addressId || '');
  const storageKey = chaveEnderecoEntregaDashboard();
  if (selectedId) {
    localStorage.setItem(storageKey, selectedId);
    localStorage.setItem('hoje-delivery-address-id', selectedId);
  } else {
    localStorage.removeItem(storageKey);
    localStorage.removeItem('hoje-delivery-address-id');
  }
}

function obterEnderecoEntregaSelecionado() {
  const selectedId = document.getElementById('store-address-select')?.value || '';
  if (!selectedId) return null;
  return enderecosDaLoja.find((address) => String(address.id) === selectedId) || null;
}

function idCarrinhoVisitante() {
  const storageKey = 'hoje-cart-id';
  let id = localStorage.getItem(storageKey);
  if (!id) {
    id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, id);
  }
  return id;
}

function garantirSeletorPagamento(finalizeButton) {
  let select = document.getElementById('payment-method');
  if (select || !finalizeButton?.parentElement) return select;

  const label = document.createElement('label');
  label.className = 'delivery-address-field';
  label.htmlFor = 'payment-method';
  label.append(document.createTextNode('Forma de pagamento'));

  select = document.createElement('select');
  select.id = 'payment-method';
  select.required = true;
  [
    ['', 'Selecione sua forma de pagamento'],
    ['pix', 'Pix'],
    ['cartao', 'Cartão'],
  ].forEach(([value, labelText]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelText;
    option.disabled = value === '';
    select.append(option);
  });
  label.append(select);
    const hint = document.createElement('small');
    hint.className = 'checkout-field-hint';
    hint.textContent = 'Obrigatória para concluir o pedido.';
    const checkoutPanel = finalizeButton.parentElement;
    checkoutPanel.insertBefore(label, finalizeButton);
    checkoutPanel.insertBefore(hint, finalizeButton);
    return select;
}

function garantirAvisoCartaoSalvoLoja(paymentSelect) {
  if (!paymentSelect) return null;
  const existingHint = document.getElementById('saved-card-payment-hint');
  if (existingHint) return existingHint;

  const paymentLabel = paymentSelect.closest('label');
  if (!paymentLabel) return null;
  const hint = document.createElement('small');
  hint.id = 'saved-card-payment-hint';
  hint.className = 'checkout-field-hint store-saved-card-hint';
  hint.setAttribute('role', 'status');
  hint.setAttribute('tabindex', '-1');
  hint.hidden = true;

  const paymentHint = paymentLabel.nextElementSibling;
  const insertionPoint = paymentHint?.classList.contains('checkout-field-hint') ? paymentHint : paymentLabel;
  insertionPoint.insertAdjacentElement('afterend', hint);
  return hint;
}

function atualizarAvisoCartaoSalvoLoja() {
  const hint = document.getElementById('saved-card-payment-hint');
  const paymentSelect = document.getElementById('payment-method');
  if (!hint) return;
  if (paymentSelect?.value !== 'cartao' || !sessaoLoja.authenticated) {
    hint.hidden = true;
    return;
  }

  hint.hidden = false;
  if (estadoCartaoSalvoLoja === 'loading' || estadoCartaoSalvoLoja === 'idle') {
    hint.textContent = 'Verificando o cartão salvo no Dashboard...';
    return;
  }
  if (estadoCartaoSalvoLoja === 'error') {
    hint.textContent = erroCartaoSalvoLoja || 'Não foi possível verificar o cartão salvo. Tente novamente.';
    return;
  }
  if (cartaoSalvoLoja) {
    hint.textContent = `Cartão salvo: ${cartaoSalvoLoja.brand} terminado em ${cartaoSalvoLoja.lastFourDigits}, validade ${String(cartaoSalvoLoja.expMonth).padStart(2, '0')}/${cartaoSalvoLoja.expYear}.`;
    return;
  }

  hint.replaceChildren(document.createTextNode('Para pagar com cartão, cadastre primeiro um cartão no '));
  const link = document.createElement('a');
  link.href = '/dashboard/payment-methods';
  link.textContent = 'Dashboard → Formas de pagamento';
  hint.append(link, '.');
}

async function carregarCartaoSalvoLoja(force = false) {
  const email = sessaoLoja.user?.email || '';
  if (!sessaoLoja.authenticated || !email) return null;
  if (cartaoSalvoLojaEmail !== email) {
    cartaoSalvoLojaEmail = email;
    cartaoSalvoLoja = null;
    estadoCartaoSalvoLoja = 'idle';
    erroCartaoSalvoLoja = '';
    promessaCartaoSalvoLoja = null;
  }
  if (promessaCartaoSalvoLoja) return promessaCartaoSalvoLoja;
  if (!force && ['loaded', 'error'].includes(estadoCartaoSalvoLoja)) return cartaoSalvoLoja;

  estadoCartaoSalvoLoja = 'loading';
  atualizarAvisoCartaoSalvoLoja();
  promessaCartaoSalvoLoja = fetch('/api/my/payment-methods', {
    cache: 'no-store',
    credentials: 'include',
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível verificar o cartão salvo.');
    cartaoSalvoLoja = data.card || null;
    estadoCartaoSalvoLoja = 'loaded';
    erroCartaoSalvoLoja = '';
    return cartaoSalvoLoja;
  }).catch((error) => {
    cartaoSalvoLoja = null;
    estadoCartaoSalvoLoja = 'error';
    erroCartaoSalvoLoja = error.message || 'Não foi possível verificar o cartão salvo.';
    return null;
  }).finally(() => {
    promessaCartaoSalvoLoja = null;
    atualizarAvisoCartaoSalvoLoja();
  });
  return promessaCartaoSalvoLoja;
}

function atualizarPreferenciaPagamentoLoja() {
  const select = document.getElementById('payment-method');
  if (!select) return;
  select.disabled = !sessaoLoja.authenticated;
  if (!sessaoLoja.authenticated) {
    select.value = '';
    atualizarAvisoCartaoSalvoLoja();
    atualizarOrientacaoCheckout();
    return;
  }

  select.value = '';
  const email = sessaoLoja.user?.email || 'guest';
  try {
    const method = localStorage.getItem(`hoje-dashboard-payment-method-${email}`);
    select.value = PAYMENT_METHODS.includes(method) ? method : '';
  } catch (error) {
    console.error('Não foi possível carregar a forma de pagamento preferida:', error);
    const feedback = document.getElementById('coupon-feedback');
    if (feedback) {
      feedback.textContent = 'Não foi possível carregar sua forma de pagamento. Verifique as permissões de armazenamento do navegador.';
      feedback.className = 'coupon-feedback error';
    }
  }
  void carregarCartaoSalvoLoja();
  atualizarAvisoCartaoSalvoLoja();
  atualizarOrientacaoCheckout();
}

function perguntarCpfNaNota() {
  let dialog = document.getElementById('cpf-note-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'cpf-note-dialog';
    dialog.className = 'cpf-note-dialog';
    dialog.setAttribute('aria-labelledby', 'cpf-note-title');
    dialog.setAttribute('aria-describedby', 'cpf-note-description');
    dialog.innerHTML = `
      <div class="cpf-note-dialog-content">
        <span class="settings-kicker">Nota fiscal</span>
        <h2 id="cpf-note-title">Deseja CPF na nota?</h2>
        <p id="cpf-note-description">A escolha é obrigatória para enviar o pedido. Se responder Sim, usaremos o CPF cadastrado no seu perfil.</p>
        <div class="cpf-note-dialog-actions">
          <button type="button" class="cpf-note-choice cpf-note-no">Não, continuar sem CPF</button>
          <button type="button" class="cpf-note-choice cpf-note-yes">Sim, quero CPF na nota</button>
          <button type="button" class="cpf-note-cancel">Voltar ao carrinho</button>
        </div>
      </div>`;
    document.body.append(dialog);
  }

  const noButton = dialog.querySelector('.cpf-note-no');
  const yesButton = dialog.querySelector('.cpf-note-yes');
  const cancelButton = dialog.querySelector('.cpf-note-cancel');

  return new Promise((resolve) => {
    const finish = (choice) => {
      dialog.removeEventListener('cancel', handleCancel);
      noButton.removeEventListener('click', handleNo);
      yesButton.removeEventListener('click', handleYes);
      cancelButton.removeEventListener('click', handleCancelButton);
      if (dialog.open) dialog.close();
      resolve(choice);
    };
    const handleCancel = (event) => {
      event.preventDefault();
      finish(null);
    };
    const handleNo = () => finish(false);
    const handleYes = () => finish(true);
    const handleCancelButton = () => finish(null);

    dialog.addEventListener('cancel', handleCancel);
    noButton.addEventListener('click', handleNo);
    yesButton.addEventListener('click', handleYes);
    cancelButton.addEventListener('click', handleCancelButton);
    dialog.showModal();
    noButton.focus();
  });
}

function confirmarPedidoLoja(resumoPedido) {
  let dialog = document.getElementById('order-confirm-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'order-confirm-dialog';
    dialog.className = 'cpf-note-dialog checkout-order-dialog';
    dialog.setAttribute('aria-labelledby', 'order-confirm-title');
    dialog.setAttribute('aria-describedby', 'order-confirm-summary');
    dialog.innerHTML = `
      <div class="cpf-note-dialog-content">
        <span class="settings-kicker">Confirmação do pedido</span>
        <h2 id="order-confirm-title">Confira seu pedido</h2>
        <p id="order-confirm-summary" class="checkout-confirm-summary"></p>
        <div class="cpf-note-dialog-actions">
          <button type="button" class="cpf-note-choice checkout-dialog-primary order-confirm-submit">Confirmar pedido</button>
          <button type="button" class="cpf-note-cancel order-confirm-cancel">Voltar ao carrinho</button>
        </div>
      </div>`;
    document.body.append(dialog);
  }

  dialog.querySelector('.checkout-confirm-summary').textContent = resumoPedido;
  const confirmButton = dialog.querySelector('.order-confirm-submit');
  const cancelButton = dialog.querySelector('.order-confirm-cancel');

  return new Promise((resolve) => {
    const finish = (confirmed) => {
      dialog.removeEventListener('cancel', handleCancel);
      confirmButton.removeEventListener('click', handleConfirm);
      cancelButton.removeEventListener('click', handleCancelButton);
      if (dialog.open) dialog.close();
      resolve(confirmed);
    };
    const handleCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const handleConfirm = () => finish(true);
    const handleCancelButton = () => finish(false);

    dialog.addEventListener('cancel', handleCancel);
    confirmButton.addEventListener('click', handleConfirm);
    cancelButton.addEventListener('click', handleCancelButton);
    dialog.showModal();
    cancelButton.focus();
  });
}

function abrirDialogoPagamentoPix(order, message) {
  let dialog = document.getElementById('pix-payment-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'pix-payment-dialog';
    dialog.className = 'cpf-note-dialog checkout-pix-dialog';
    dialog.setAttribute('aria-labelledby', 'pix-payment-title');
    dialog.setAttribute('aria-describedby', 'pix-payment-description');
    dialog.innerHTML = `
      <div class="cpf-note-dialog-content">
        <span class="settings-kicker">Pagamento Pix</span>
        <h2 id="pix-payment-title">Conclua seu pagamento</h2>
        <p id="pix-payment-description"></p>
        <strong class="checkout-pix-order-id"></strong>
        <img class="checkout-pix-qr" alt="QR Code Pix" hidden>
        <small class="checkout-pix-qr-status" role="status"></small>
        <label class="checkout-pix-code-label" for="pix-payment-code">Código Pix copia e cola</label>
        <textarea id="pix-payment-code" class="checkout-pix-code" readonly rows="4" aria-label="Código Pix copia e cola"></textarea>
        <small class="checkout-pix-expires" hidden></small>
        <p class="checkout-pix-fallback" hidden>Se os dados do Pix não aparecerem, consulte <a href="/dashboard/orders">Meus pedidos</a> antes de tentar novamente.</p>
        <small class="checkout-pix-copy-status" role="status" aria-live="polite"></small>
        <div class="cpf-note-dialog-actions">
          <button type="button" class="cpf-note-choice checkout-dialog-primary pix-copy-button">Copiar código Pix</button>
          <button type="button" class="cpf-note-cancel pix-dialog-close">Fechar</button>
        </div>
      </div>`;
    document.body.append(dialog);

    const codeField = dialog.querySelector('#pix-payment-code');
    const copyButton = dialog.querySelector('.pix-copy-button');
    const copyStatus = dialog.querySelector('.checkout-pix-copy-status');
    const qrImage = dialog.querySelector('.checkout-pix-qr');
    copyButton.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('A cópia automática não está disponível neste navegador.');
        await navigator.clipboard.writeText(codeField.value);
        copyStatus.textContent = 'Código Pix copiado. Abra o aplicativo do seu banco para concluir o pagamento.';
      } catch (error) {
        console.error('Não foi possível copiar automaticamente o código Pix:', error);
        codeField.focus();
        codeField.select();
        copyStatus.textContent = 'Não foi possível copiar automaticamente. O código está selecionado; copie-o manualmente.';
      }
    });
    qrImage.addEventListener('error', () => {
      qrImage.hidden = true;
      dialog.querySelector('.checkout-pix-qr-status').textContent = 'QR Code indisponível. Use o código copia e cola.';
    });
    dialog.querySelector('.pix-dialog-close').addEventListener('click', () => dialog.close());
  }

  const paymentDetails = order?.paymentDetails || {};
  const pixCode = String(paymentDetails.pixQrCode || '').trim();
  const codeField = dialog.querySelector('#pix-payment-code');
  const codeLabel = dialog.querySelector('.checkout-pix-code-label');
  const copyButton = dialog.querySelector('.pix-copy-button');
  const qrImage = dialog.querySelector('.checkout-pix-qr');
  const qrStatus = dialog.querySelector('.checkout-pix-qr-status');
  const expiresLabel = dialog.querySelector('.checkout-pix-expires');
  const fallback = dialog.querySelector('.checkout-pix-fallback');
  const copyStatus = dialog.querySelector('.checkout-pix-copy-status');

  dialog.querySelector('#pix-payment-description').textContent = message
    || 'Seu pedido está aguardando o pagamento Pix. Use o QR Code ou o código copia e cola abaixo.';
  dialog.querySelector('.checkout-pix-order-id').textContent = order?.id ? `Pedido ${order.id}` : '';
  codeField.value = pixCode;
  codeLabel.hidden = !pixCode;
  copyButton.hidden = !pixCode;
  codeField.hidden = !pixCode;
  fallback.hidden = Boolean(pixCode);
  copyStatus.textContent = '';
  qrStatus.textContent = '';
  qrImage.hidden = true;
  qrImage.removeAttribute('src');

  if (pixCode && paymentDetails.pixQrCodeUrl) {
    try {
      const qrUrl = new URL(paymentDetails.pixQrCodeUrl);
      if (qrUrl.protocol === 'https:' && qrUrl.hostname === 'api.pagar.me') {
        qrImage.src = qrUrl.href;
        qrImage.hidden = false;
      } else {
        qrStatus.textContent = 'QR Code indisponível. Use o código copia e cola.';
      }
    } catch (error) {
      console.error('A URL do QR Code Pix retornada pelo provedor é inválida:', error);
      qrStatus.textContent = 'QR Code indisponível. Use o código copia e cola.';
    }
  } else if (pixCode) {
    qrStatus.textContent = 'Use o código copia e cola para concluir o pagamento.';
  }

  const expiryDate = paymentDetails.pixExpiresAt ? new Date(paymentDetails.pixExpiresAt) : null;
  if (expiryDate && !Number.isNaN(expiryDate.getTime())) {
    expiresLabel.textContent = `Válido até ${expiryDate.toLocaleString('pt-BR')}`;
    expiresLabel.hidden = false;
  } else {
    expiresLabel.textContent = '';
    expiresLabel.hidden = true;
  }

  if (!dialog.open) dialog.showModal();
  (pixCode ? copyButton : dialog.querySelector('.pix-dialog-close')).focus();
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
      erroCarrinhoDaApi = '';
      atualizarOrientacaoCheckout();
    })
    .catch((error) => {
      erroCarrinhoDaApi = error.message || 'Falha ao salvar carrinho.';
      console.warn('Não foi possível sincronizar o carrinho:', error.message);
      const feedback = document.getElementById('coupon-feedback');
      if (feedback) {
        feedback.textContent = 'Seus itens estão visíveis neste momento, mas não foi possível salvá-los. Verifique sua conexão e tente novamente.';
        feedback.className = 'coupon-feedback error';
      }
      atualizarOrientacaoCheckout();
    })
    .finally(() => {
      carrinhoGravacoesPendentes -= 1;
    });
  await filaGravacaoCarrinho;
}

function aplicarCarrinhoNosCartoes(cart, cards = document.querySelectorAll('.product-card')) {
  const normalizedCart = Array.isArray(cart) ? cart : [];
  cards.forEach((card) => {
    const name = card.querySelector('.product-name')?.textContent.trim();
    const controls = card.querySelector('.qty-controls');
    const quantity = card.querySelector('.qty');
    const buyButton = card.querySelector('.btn-comprar');
    if (!name || !controls || !quantity || !buyButton) return;

    const item = normalizedCart.find((savedItem) => (
      (card.dataset.id && String(savedItem.productId || savedItem.id || '') === card.dataset.id)
      || normalizarCatalogo(savedItem.name || savedItem.nome) === normalizarCatalogo(name)
    ));
    if (item) {
      definirQuantidade(card, Number(item.quantity ?? item.qty) || (produtoVendidoPorKg(card) ? 0.1 : 1));
      controls.classList.add('show');
      buyButton.style.display = 'none';
    } else {
      definirQuantidade(card, produtoVendidoPorKg(card) ? 0.1 : 1);
      controls.classList.remove('show');
      buyButton.style.display = 'block';
    }
  });
}

async function carregarCarrinhoDaApi() {
  if (carrinhoAtualizando) return;

  carrinhoAtualizando = true;
  const revisionAtStart = carrinhoRevision;
  let persistirCarrinhoLocal = false;
  try {
    const response = await fetch(CART_API, opcoesCarrinho({ cache: 'no-store' }));
    if (!response.ok) throw new Error(`Falha ao carregar carrinho (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data?.cart)) throw new Error('Resposta inválida ao carregar o carrinho.');
    const { cart } = data;
    erroCarrinhoDaApi = '';
    const localCartChanged = carrinhoRevision !== revisionAtStart || carrinhoGravacoesPendentes > 0;

    if (localCartChanged) {
      persistirCarrinhoLocal = carrinhoRevision !== revisionAtStart;
    } else {
      carrinhoItens = cart.map(normalizarItemCarrinho);
      aplicarCarrinhoNosCartoes(cart);
      carrinhoHidratado = true;
      renderizarCarrinho(false);
    }

  } catch (error) {
    erroCarrinhoDaApi = error.message || 'Falha ao carregar carrinho.';
    console.warn('Carrinho compartilhado indisponível:', error.message);
    persistirCarrinhoLocal = carrinhoRevision !== revisionAtStart;
  } finally {
    carrinhoHidratado = true;
    carrinhoAtualizando = false;
    if (persistirCarrinhoLocal) renderizarCarrinho();
    atualizarOrientacaoCheckout();
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
    if (!data || typeof data.authenticated !== 'boolean') throw new Error('Resposta inválida ao verificar a sessão.');
    erroSessaoDaLoja = '';
    sessaoLoja = data;
    atualizarPreferenciaPagamentoLoja();
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
      favoritosLoja = new Set();
      if (nameElement) nameElement.textContent = 'Olá, faça seu login';
      if (statusElement) statusElement.textContent = 'ou cadastre-se';
      document.getElementById('login-trigger')?.classList.remove('is-authenticated');
      document.getElementById('login-trigger')?.setAttribute('aria-label', 'Ir para o login do dashboard');
      if (favoritesElement) favoritesElement.textContent = 'Entre para favoritar';
      document.querySelectorAll('.product-card').forEach((card) => {
        const button = card.querySelector('.fav-btn');
        if (!button) return;
        button.classList.remove('is-favorite');
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label', 'Adicionar aos favoritos');
      });
    }

    document.querySelectorAll('.fav-btn').forEach((button) => {
      button.disabled = !sessaoLoja.authenticated;
      button.title = sessaoLoja.authenticated ? 'Adicionar aos favoritos' : 'Entre para favoritar';
    });

    if (sessaoLoja.authenticated) await carregarFavoritosDaApi();
    await carregarEnderecosDaApi();
    await carregarCarrinhoDaApi();
    atualizarOrientacaoCheckout();
  } catch (error) {
    erroSessaoDaLoja = error.message || 'Sessão indisponível.';
    sessaoLoja = { authenticated: false, user: null };
    atualizarPreferenciaPagamentoLoja();
    atualizarBotaoFinalizarCompra();
    console.warn('Não foi possível verificar o login:', error.message);
    atualizarOrientacaoCheckout();
  }
}

async function carregarEnderecosDaApi() {
  const headerSelect = document.getElementById('store-address-select');
  if (!headerSelect) return;
  try {
    const response = await fetch(ADDRESSES_API, { credentials: 'include' });
    if (!response.ok) throw new Error(`Falha ao carregar endereços (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data?.addresses)) throw new Error('Resposta inválida ao carregar endereços.');
    const { addresses } = data;
    erroEnderecosDaApi = '';
    enderecosDaLoja = addresses;
    headerSelect.innerHTML = '<option value="">Selecione seu endereço</option>';
    addresses.forEach((address) => {
      const option = document.createElement('option');
      const streetAndNumber = [address.street, address.number].filter(Boolean).join(', ');
      const location = [address.neighborhood, address.city, address.state, address.country].filter(Boolean).join(', ');
      const title = String(address.title || '').trim();
      const shortAddress = [title, streetAndNumber || location].filter(Boolean).join(' · ');
      const fullAddress = [title, streetAndNumber, location].filter(Boolean).join(' · ');
      option.value = String(address.id);
      option.textContent = shortAddress || 'Endereço salvo';
      option.dataset.address = fullAddress || option.textContent;
      option.dataset.location = [
        address.neighborhood,
        [address.city, address.state].filter(Boolean).join('/'),
      ].filter(Boolean).join(' · ') || address.country || '';
      headerSelect.appendChild(option);
    });
    const savedAddressId = localStorage.getItem(chaveEnderecoEntregaDashboard())
      || localStorage.getItem('hoje-delivery-address-id')
      || '';
    const selectedAddress = addresses.find((address) => String(address.id) === savedAddressId)
      || addresses.find((address) => address.type === 'Padrão')
      || addresses[0];
    const selectedId = selectedAddress ? String(selectedAddress.id) : '';
    headerSelect.value = selectedId;
    persistirEnderecoEntregaSelecionado(selectedId);
    if (!headerSelect.dataset.bound) {
      headerSelect.addEventListener('change', () => {
        persistirEnderecoEntregaSelecionado(headerSelect.value);
        updateAddressSummaryFromSelection();
      });
      headerSelect.dataset.bound = 'true';
    }
    updateAddressSummaryFromSelection();
  } catch (error) {
    erroEnderecosDaApi = error.message || 'Falha ao carregar endereços.';
    console.warn('Endereços cadastrados indisponíveis:', error.message);
    const locationDetails = document.getElementById('location-address-details');
    if (locationDetails) {
      locationDetails.textContent = 'Não foi possível carregar seus endereços. Tente recarregar a página.';
      locationDetails.hidden = false;
    }
    atualizarOrientacaoCheckout();
  }
}

function updateAddressSummaryFromSelection() {
  const headerSelect = document.getElementById('store-address-select');
  const selected = headerSelect?.selectedOptions[0];
  const locationSummary = document.getElementById('location-summary');
  const locationDetails = document.getElementById('location-address-details');
  const selectedAddress = selected?.value
    ? enderecosDaLoja.find((address) => String(address.id) === selected.value)
    : null;
  if (locationSummary) {
    locationSummary.setAttribute(
      'aria-label',
      selectedAddress ? `Endereço de entrega: ${selected.dataset.address || selected.textContent.trim()}` : 'Nenhum endereço de entrega selecionado',
    );
  }
  if (locationDetails) {
    locationDetails.textContent = selectedAddress
      ? selected.dataset.location || 'Endereço selecionado para entrega.'
      : '';
    locationDetails.hidden = !selectedAddress;
  }
  atualizarOrientacaoCheckout();
}

function toggleCategoriasLoja() {
  const button = document.getElementById('all-categories');
  const menu = document.getElementById('all-categories-menu');
  if (!menu || !button) return;

  const expanded = button.getAttribute('aria-expanded') !== 'true';
  if (expanded) {
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    menu.setAttribute('aria-hidden', 'false');
    button.querySelector('span').textContent = 'Recolher categorias';
    return;
  }

  fecharMenuCategoriasLoja();
}

function fecharMenuCategoriasLoja() {
  const button = document.getElementById('all-categories');
  const menu = document.getElementById('all-categories-menu');
  if (!menu || !button) return;

  button.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
  menu.setAttribute('aria-hidden', 'true');
  button.querySelector('span').textContent = 'Todas as categorias';
}

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element) || event.target.closest('.categories-navigation')) return;
  const button = document.getElementById('all-categories');
  if (button?.getAttribute('aria-expanded') === 'true') toggleCategoriasLoja();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const button = document.getElementById('all-categories');
  if (button?.getAttribute('aria-expanded') !== 'true') return;
  toggleCategoriasLoja();
  button.focus();
});

function atualizarBotaoFinalizarCompra() {
  const button = document.getElementById('finalizar-compra');
  if (!button) return;
  const selectedAddress = obterEnderecoEntregaSelecionado();
  const addressUnavailable = sessaoLoja.authenticated && (Boolean(erroEnderecosDaApi) || !selectedAddress);
  button.disabled = checkoutLojaEmAndamento || Boolean(erroSessaoDaLoja) || addressUnavailable;
  button.textContent = checkoutLojaEmAndamento
    ? 'Processando pedido...'
    : erroSessaoDaLoja
    ? 'Verifique sua conexão'
    : sessaoLoja.authenticated
    ? erroEnderecosDaApi
      ? 'Verifique seus endereços'
      : selectedAddress
        ? 'Finalizar Pedido'
        : 'Cadastre um endereço'
    : 'Fazer login';
  button.dataset.loginRequired = String(!sessaoLoja.authenticated);
}

function atualizarOrientacaoCheckout() {
  atualizarBotaoFinalizarCompra();
  const guide = document.getElementById('checkout-guide');
  if (!guide) return;

  const title = document.getElementById('checkout-guide-title');
  const message = document.getElementById('checkout-guide-message');
  const addressLink = document.getElementById('checkout-address-link');
  const retryButton = document.getElementById('checkout-retry');
  const selectedAddress = obterEnderecoEntregaSelecionado();
  const paymentSelect = document.getElementById('payment-method');
  const totalText = document.querySelector('.cart-summary-box .summary-row.total strong')?.textContent.trim() || '';
  const hasApiError = Boolean(erroSessaoDaLoja || erroCarrinhoDaApi || erroEnderecosDaApi);

  let currentTitle = '';
  let currentMessage = '';
  let state = 'info';
  let hideGuide = false;
  let showAddressLink = false;

  if (hasApiError) {
    currentTitle = 'Não foi possível carregar seus dados';
    currentMessage = erroSessaoDaLoja
      ? 'Não conseguimos confirmar seu acesso. Verifique sua conexão e tente novamente.'
      : erroCarrinhoDaApi
      ? 'Não conseguimos sincronizar os itens do carrinho. Tente novamente antes de concluir o pedido.'
      : 'Não conseguimos carregar seus endereços. Tente novamente antes de concluir o pedido.';
    state = 'error';
  } else if (!carrinhoItens.length) {
    currentTitle = 'Monte seu carrinho';
    currentMessage = 'Adicione os produtos desejados para começar seu pedido.';
  } else if (!sessaoLoja.authenticated) {
    hideGuide = true;
  } else if (!selectedAddress && !enderecosDaLoja.length) {
    currentTitle = 'Cadastre um endereço de entrega';
    currentMessage = 'Adicione um endereço no painel do cliente para continuar.';
    showAddressLink = true;
  } else if (!selectedAddress) {
    currentTitle = 'Selecione onde entregar';
    currentMessage = 'Escolha o endereço no seletor do topo da loja.';
  } else if (!paymentSelect?.value) {
    currentTitle = 'Escolha como pagar';
    currentMessage = 'Usaremos o endereço selecionado no painel do cliente. Escolha a forma de pagamento.';
  } else {
    currentTitle = 'Revise seu pedido';
    currentMessage = `Endereço do painel confirmado. Total do pedido: ${totalText}. Confira os itens antes de finalizar.`;
    state = 'ready';
  }

  if (title) title.textContent = currentTitle;
  if (message) message.textContent = currentMessage;
  if (addressLink) addressLink.hidden = !showAddressLink;
  if (retryButton) retryButton.hidden = !hasApiError;
  guide.dataset.state = state;
  guide.hidden = hideGuide;
}

function obterDadosFavorito(card) {
  const nome = card.querySelector('.product-name')?.textContent.trim() || 'Produto';
  const priceElement = card.querySelector('.product-price')?.cloneNode(true);
  priceElement?.querySelector('.old-price')?.remove();

  return {
    productId: card.dataset.id || '',
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
  if (!favorite.productId) {
    console.error('Não foi possível salvar o favorito porque o produto não tem identificador no catálogo.');
    return;
  }
  const ativo = button.classList.toggle('is-favorite');
  button.setAttribute('aria-pressed', String(ativo));
  button.setAttribute('aria-label', ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');

  try {
    const response = await fetch(FAVORITES_API, ativo
      ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: { productId: favorite.productId } }) }
      : { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: favorite.productId }) });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível sincronizar o favorito.');
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

  if (texto.includes('banana') || texto.includes('maçã') || texto.includes('maça') || texto.includes('uva') || texto.includes('laranja') || texto.includes('morango') || texto.includes('fruta')) {
    return 'Fruta';
  }

  if (texto.includes('tomate') || texto.includes('alface') || texto.includes('cenoura') || texto.includes('batata') || texto.includes('cebola') || texto.includes('verdura')) {
    return 'Verdura';
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
  const cartTrigger = document.getElementById('cart-trigger');

  fecharMenuCategoriasLoja();
  if (cartPanel) {
    cartPanel.classList.add('open');
    cartPanel.removeAttribute('inert');
    cartPanel.setAttribute('aria-hidden', 'false');
    document.getElementById('cart-close')?.focus();
  }
  if (cartBackdrop) cartBackdrop.classList.add('open');
  cartTrigger?.setAttribute('aria-expanded', String(Boolean(cartPanel)));
}

function fecharCarrinho() {
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartTrigger = document.getElementById('cart-trigger');

  if (cartPanel) {
    cartPanel.classList.remove('open');
    cartPanel.setAttribute('inert', '');
    cartPanel.setAttribute('aria-hidden', 'true');
  }
  if (cartBackdrop) cartBackdrop.classList.remove('open');
  cartTrigger?.setAttribute('aria-expanded', 'false');
  cartTrigger?.focus();
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

  const itensPorProduto = new Map();
  carrinhoItens.forEach((rawItem) => {
    const item = normalizarItemCarrinho(rawItem);
    const key = normalizarCatalogo(item.nome);
    if (key) itensPorProduto.set(key, item);
  });
  carrinhoItens = [...itensPorProduto.values()];
  const itens = carrinhoItens;
  let totalItens = 0;
  let totalPreco = 0;

  itens.forEach((item) => {
    totalItens += item.saleUnit === 'Quilograma' ? 1 : item.qty;
    totalPreco += item.qty * item.preco;
  });

  if (badge) badge.textContent = String(totalItens);

  if (cartTitle) {
    const textoItens = totalItens === 1 ? 'item' : 'itens';
    cartTitle.textContent = `Meu Carrinho (${totalItens} ${textoItens})`;
  }

  const summaryEl = document.querySelector('.cart-summary-box');

  const desconto = totalPreco * descontoPercentual;
  const totalComDesconto = Math.max(0, totalPreco - desconto);
  if (totalEl) totalEl.textContent = formatarPreco(totalComDesconto);
  if (cartPanelTotal) cartPanelTotal.textContent = formatarPreco(totalComDesconto);

  if (!itens.length) {
    if (cartItems) cartItems.innerHTML = '<div class="cart-empty">Seu carrinho está vazio.</div>';
    if (summaryEl) summaryEl.innerHTML = `
      <div class="summary-row"><span>Subtotal (0 itens)</span><strong>R$ 0,00</strong></div>
      <div class="summary-row"><span>Descontos</span><strong>R$ 0,00</strong></div>
      <div class="summary-row"><span>Frete</span><strong>R$ 0,00</strong></div>
      <div class="summary-row total"><span>Total</span><strong>R$ 0,00</strong></div>
    `;
    atualizarOrientacaoCheckout();
    if (persistir) sincronizarCarrinhoApi([]);
    return;
  }

  if (cartItems) cartItems.innerHTML = itens.map(item => `
    <div class="cart-item" data-name="${escapeStoreHtml(item.nome)}">
      <div class="cart-item-thumb">
        ${item.imagem ? `<img src="${escapeStoreHtml(item.imagem)}" alt="${escapeStoreHtml(item.nome)}">` : '<div class="cart-thumb-placeholder"></div>'}
      </div>

      <div class="cart-item-info">
        <div class="cart-item-name">${escapeStoreHtml(item.nome)}</div>
        <div class="cart-item-unit-price">${formatarPreco(item.preco)} ${item.saleUnit === 'Quilograma' ? 'por kg' : 'por unidade'}</div>
        <div class="cart-item-price">${formatarPreco(item.preco * item.qty)}</div>
      </div>

      <div class="cart-item-actions">
        <div class="cart-item-controls">
          <button class="qty-minus" data-action="decrement" data-name="${escapeStoreHtml(item.nome)}" aria-label="Diminuir quantidade de ${escapeStoreHtml(item.nome)}">−</button>
          <span class="cart-item-qty">${formatarQuantidade(item.qty, item.saleUnit === 'Quilograma')}</span>
          <button class="qty-plus" data-action="increment" data-name="${escapeStoreHtml(item.nome)}" aria-label="Aumentar quantidade de ${escapeStoreHtml(item.nome)}">+</button>
        </div>
        <button class="cart-item-remove" data-action="remove" data-name="${escapeStoreHtml(item.nome)}" aria-label="Remover ${escapeStoreHtml(item.nome)}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
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

  atualizarOrientacaoCheckout();
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

function obterProdutoDoCartao(card) {
  const nome = card?.querySelector('.product-name')?.textContent.trim();
  if (!nome) return null;
  const categoria = card.querySelector('.product-category')?.textContent.trim() || inferirCategoria(nome);
  const preco = obterPrecoProduto(card);
  return {
    id: card.dataset.id || nome,
    title: nome,
    categories: [categoria],
    subcategory: categoria,
    price: preco,
    salePrice: preco,
    image: card.querySelector('.product-img')?.getAttribute('src') || '',
    saleUnit: produtoVendidoPorKg(card) ? 'Quilograma' : 'Unidade',
  };
}

function normalizarProdutoParaCarrinho(product) {
  const nome = String(product?.title || product?.name || product?.nome || '').trim();
  const price = Number(product?.salePrice ?? product?.price ?? product?.preco);
  if (!nome || !Number.isFinite(price) || price < 0) return null;

  const saleUnit = product.saleUnit === 'Quilograma' || product.unit === 'kg' ? 'Quilograma' : 'Unidade';
  return normalizarItemCarrinho({
    id: product.id || product.productId || nome,
    nome,
    categoria: product.category || product.categoria || getProductCardCategoryLabel(product),
    qty: saleUnit === 'Quilograma' ? 0.1 : 1,
    preco: price,
    imagem: product.image || product.imagem || '',
    saleUnit,
  });
}

function encontrarIndiceCarrinho(product) {
  const name = normalizarCatalogo(product.nome || product.title || product.name);
  return carrinhoItens.findIndex((item) => (
    (product.id && String(item.id) === String(product.id))
    || normalizarCatalogo(item.nome) === name
  ));
}

function atualizarCartoesDoProduto(product, cartItem) {
  const productName = normalizarCatalogo(product.nome || product.title || product.name);
  const productId = String(product.id || product.productId || '');
  document.querySelectorAll('.product-card').forEach((card) => {
    const name = normalizarCatalogo(card.querySelector('.product-name')?.textContent.trim());
    if ((productId && card.dataset.id === productId) || name === productName) {
      const controls = card.querySelector('.qty-controls');
      const quantity = card.querySelector('.qty');
      const buyButton = card.querySelector('.btn-comprar');
      if (!controls || !quantity || !buyButton) return;

      if (cartItem) {
        definirQuantidade(card, cartItem.qty);
        controls.classList.add('show');
        buyButton.style.display = 'none';
      } else {
        definirQuantidade(card, produtoVendidoPorKg(card) ? 0.1 : 1);
        controls.classList.remove('show');
        buyButton.style.display = 'block';
      }
    }
  });
}

function alterarCarrinhoDoProduto(product, operation, initialQuantity) {
  const normalizedProduct = normalizarProdutoParaCarrinho(product);
  if (!normalizedProduct) {
    console.error('Não foi possível adicionar o produto: nome ou preço inválido.', product);
    return null;
  }

  const step = normalizedProduct.saleUnit === 'Quilograma' ? 0.1 : 1;
  const index = encontrarIndiceCarrinho(normalizedProduct);

  if (operation === 'remove') {
    carrinhoItens = carrinhoItens.filter((item) => encontrarIndiceCarrinho(item) !== index);
  } else if (index < 0) {
    if (operation === 'decrement') return null;
    normalizedProduct.qty = normalizedProduct.saleUnit === 'Quilograma'
      ? Math.max(step, Math.round((Number(initialQuantity) || step) * 10) / 10)
      : Math.max(1, Math.trunc(Number(initialQuantity) || 1));
    carrinhoItens.push(normalizedProduct);
  } else if (operation === 'increment' || operation === 'decrement') {
    const item = carrinhoItens[index];
    const next = item.qty + (operation === 'increment' ? step : -step);
    item.qty = item.saleUnit === 'Quilograma'
      ? Math.max(step, Math.round(next * 10) / 10)
      : Math.max(step, Math.trunc(next));
  }

  carrinhoRevision += 1;
  const cartItem = carrinhoItens.find((item) => (
    (normalizedProduct.id && String(item.id) === String(normalizedProduct.id))
    || normalizarCatalogo(item.nome) === normalizarCatalogo(normalizedProduct.nome)
  ));
  atualizarCartoesDoProduto(normalizedProduct, cartItem);
  renderizarCarrinho();
  return cartItem || null;
}

function ajustarQuantidadeProduto(nome, operacao) {
  const item = carrinhoItens.find((cartItem) => normalizarCatalogo(cartItem.nome) === normalizarCatalogo(nome));
  if (item) alterarCarrinhoDoProduto(item, operacao);
}

function exibirConfirmacaoCarrinho(nome) {
  const toast = document.getElementById('store-feedback-toast');
  if (!toast) return;
  toast.textContent = `${nome} adicionado ao carrinho.`;
  toast.classList.add('show');
  window.clearTimeout(toastCarrinhoTimer);
  toastCarrinhoTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

// Chamada quando clica em "Comprar"
function adicionarProduto(botao) {
  const card = botao.closest('.product-card');
  const product = obterProdutoDoCartao(card);
  if (!product) return;

  const cartItem = alterarCarrinhoDoProduto(product, 'add', lerQuantidade(card));
  if (!cartItem) return;
  card.classList.remove('is-added');
  void card.offsetWidth;
  card.classList.add('is-added');

  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.classList.remove('pulse');
    void badge.offsetWidth;
    badge.classList.add('pulse');
  }
  exibirConfirmacaoCarrinho(product.title);
}

// Chamada quando clica no "+"
function aumentarQtd(botao) {
  const card = botao.closest('.product-card');
  const product = obterProdutoDoCartao(card);
  if (product) alterarCarrinhoDoProduto(product, 'increment');
}

// Chamada quando clica na lixeira
function removerProduto(botao) {
  const card = botao.closest('.product-card');
  const product = obterProdutoDoCartao(card);
  if (product) alterarCarrinhoDoProduto(product, 'remove');
}

// Adiciona automaticamente o botão de favoritar (coração) em
// qualquer .product-card que ainda não tenha um
function adicionarBotoesFavorito(cards = document.querySelectorAll('.product-card'), carregarDados = true) {
  cards.forEach(card => {
    let btn = card.querySelector('.fav-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'fav-btn';
      btn.innerHTML = '<i data-lucide="heart"></i>';
      card.prepend(btn);
    }

    btn.type = 'button';
    const productId = card.dataset.id || '';
    btn.disabled = !sessaoLoja.authenticated || !productId;
    const ativo = favoritosLoja.has(productId);
    btn.title = !sessaoLoja.authenticated
      ? 'Entre para favoritar'
      : productId
        ? 'Adicionar aos favoritos'
        : 'Produto indisponível para favoritar';
    btn.setAttribute('aria-label', ativo ? 'Remover dos favoritos' : 'Adicionar aos favoritos');
    btn.setAttribute('aria-pressed', String(ativo));
    btn.classList.toggle('is-favorite', ativo);
    if (!btn.dataset.favoriteBound) {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        sincronizarFavorito(card, btn);
      });
      btn.dataset.favoriteBound = 'true';
    }
  });

  if (carregarDados) carregarFavoritosDaApi();
}

async function carregarFavoritosDaApi() {
  try {
    const response = await fetch(FAVORITES_API, { credentials: 'include' });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data?.favorites)) throw new Error('Resposta inválida ao carregar favoritos.');
    favoritosLoja = new Set(data.favorites.map((item) => String(item.productId || item.id || '')).filter(Boolean));

    const favoritesElement = document.getElementById('store-favorites-count');
    if (favoritesElement) favoritesElement.textContent = `${favoritosLoja.size} ${favoritosLoja.size === 1 ? 'item' : 'itens'}`;

    document.querySelectorAll('.product-card').forEach((card) => {
      const button = card.querySelector('.fav-btn');
      if (!button) return;
      const ativo = favoritosLoja.has(card.dataset.id || '');
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

function adicionarCategoriasProdutos(cards = document.querySelectorAll('.product-card')) {
  cards.forEach(card => {
    const nomeEl = card.querySelector('.product-name');
    if (!nomeEl) return;

    const nome = (nomeEl.textContent || '').trim();
    if (!card.dataset.saleUnit && /\bkg\s*$/i.test(nome)) card.dataset.saleUnit = 'Quilograma';

    const priceElement = card.querySelector('.product-price');
    if (priceElement && !priceElement.querySelector('.product-price-unit')) {
      const unit = document.createElement('span');
      unit.className = 'product-price-unit';
      unit.textContent = produtoVendidoPorKg(card) ? 'por kg' : 'por unidade';
      priceElement.insertBefore(unit, priceElement.querySelector('.old-price'));
    }

    if (card.querySelector('.product-category')) return;
    const nomeNormalizado = nome.toLowerCase();
    let categoria = 'Produtos';

    if (nomeNormalizado.includes('banana') || nomeNormalizado.includes('maçã') || nomeNormalizado.includes('maça') || nomeNormalizado.includes('laranja') || nomeNormalizado.includes('uva') || nomeNormalizado.includes('morango') || nomeNormalizado.includes('fruta')) {
      categoria = 'Fruta';
    } else if (nomeNormalizado.includes('tomate') || nomeNormalizado.includes('alface') || nomeNormalizado.includes('cenoura') || nomeNormalizado.includes('batata') || nomeNormalizado.includes('cebola') || nomeNormalizado.includes('verdura')) {
      categoria = 'Verdura';
    } else if (nomeNormalizado.includes('leite') || nomeNormalizado.includes('queijo') || nomeNormalizado.includes('iogurte') || nomeNormalizado.includes('latic')) {
      categoria = 'Laticínios';
    } else if (nomeNormalizado.includes('coca') || nomeNormalizado.includes('refrigerante') || nomeNormalizado.includes('suco') || nomeNormalizado.includes('bebida') || nomeNormalizado.includes('cerveja') || nomeNormalizado.includes('vinho')) {
      categoria = 'Bebidas';
    } else if (nomeNormalizado.includes('arroz') || nomeNormalizado.includes('feijão') || nomeNormalizado.includes('macarrão') || nomeNormalizado.includes('farinha') || nomeNormalizado.includes('açúcar') || nomeNormalizado.includes('molho')) {
      categoria = 'Mercearia';
    } else if (nomeNormalizado.includes('detergente') || nomeNormalizado.includes('sabão') || nomeNormalizado.includes('amaciante') || nomeNormalizado.includes('veja') || nomeNormalizado.includes('omo') || nomeNormalizado.includes('limpeza') || nomeNormalizado.includes('água sanitária')) {
      categoria = 'Limpeza';
    } else if (nomeNormalizado.includes('ração') || nomeNormalizado.includes('pet') || nomeNormalizado.includes('cachorro') || nomeNormalizado.includes('gato')) {
      categoria = 'Pet Shop';
    } else if (nomeNormalizado.includes('café') || nomeNormalizado.includes('pão') || nomeNormalizado.includes('bolacha') || nomeNormalizado.includes('padaria')) {
      categoria = 'Padaria';
    } else if (nomeNormalizado.includes('carne') || nomeNormalizado.includes('frango') || nomeNormalizado.includes('bovino') || nomeNormalizado.includes('salsicha')) {
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
  const cartPanel = document.getElementById('cart-panel');
  const cartBackdrop = document.getElementById('cart-backdrop');
  const cartClose = document.getElementById('cart-close');
  const limparCarrinhoBtn = document.getElementById('limpar-carrinho');
  const cartItems = document.getElementById('cart-items');
  const loginTrigger = document.getElementById('login-trigger');
  const couponInput = document.getElementById('coupon-input');
  const applyCouponBtn = document.getElementById('apply-coupon');
  const feedback = document.getElementById('coupon-feedback');
  const storeAddressSelect = document.getElementById('store-address-select');
  const finalizeButton = document.getElementById('finalizar-compra');
  const paymentSelect = garantirSeletorPagamento(finalizeButton);
  garantirAvisoCartaoSalvoLoja(paymentSelect);
  const checkoutRetryButton = document.getElementById('checkout-retry');

  if (paymentSelect) {
    atualizarAvisoCartaoSalvoLoja();
    paymentSelect.addEventListener('change', () => {
      atualizarAvisoCartaoSalvoLoja();
      if (!sessaoLoja.authenticated || !PAYMENT_METHODS.includes(paymentSelect.value)) return;
      if (paymentSelect.value === 'cartao') void carregarCartaoSalvoLoja();
      const email = sessaoLoja.user?.email || 'guest';
      try {
        localStorage.setItem(`hoje-dashboard-payment-method-${email}`, paymentSelect.value);
        window.dispatchEvent(new CustomEvent('dashboard-payment-method-updated', {
          detail: { email, method: paymentSelect.value },
        }));
      } catch (error) {
        console.error('Não foi possível salvar a forma de pagamento preferida:', error);
        if (feedback) {
          feedback.textContent = 'Não foi possível salvar sua forma de pagamento. Verifique as permissões de armazenamento do navegador.';
          feedback.className = 'coupon-feedback error';
        }
      }
      atualizarOrientacaoCheckout();
    });
    window.addEventListener('storage', atualizarPreferenciaPagamentoLoja);
    window.addEventListener('dashboard-saved-card-updated', () => { void carregarCartaoSalvoLoja(true); });
    atualizarPreferenciaPagamentoLoja();
  }

  window.addEventListener('storage', (event) => {
    const storageKey = chaveEnderecoEntregaDashboard();
    if (!sessaoLoja.authenticated || (event.key !== storageKey && event.key !== 'hoje-delivery-address-id')) return;
    const selectedId = event.key === storageKey
      ? event.newValue || ''
      : localStorage.getItem(storageKey) || event.newValue || '';
    if (selectedId && !enderecosDaLoja.some((address) => String(address.id) === selectedId)) {
      void carregarEnderecosDaApi();
      return;
    }
    if (storeAddressSelect) storeAddressSelect.value = selectedId;
    updateAddressSummaryFromSelection();
  });

  if (checkoutRetryButton) {
    checkoutRetryButton.addEventListener('click', async () => {
      checkoutRetryButton.disabled = true;
      try {
        if (erroSessaoDaLoja) {
          await carregarSessaoDaLoja();
        } else {
          await Promise.all([carregarEnderecosDaApi(), carregarCarrinhoDaApi()]);
        }
      } finally {
        checkoutRetryButton.disabled = false;
        atualizarOrientacaoCheckout();
      }
    });
  }

  if (finalizeButton) {
    finalizeButton.addEventListener('click', async () => {
      if (checkoutLojaEmAndamento) return;
      if (erroSessaoDaLoja) {
        if (feedback) {
          feedback.textContent = 'Não foi possível confirmar sua sessão. Tente novamente no aviso acima.';
          feedback.className = 'coupon-feedback error';
        }
        return;
      }

      if (!sessaoLoja.authenticated) {
        abrirLoginDashboard();
        return;
      }

      if (erroEnderecosDaApi) {
        if (feedback) {
          feedback.textContent = 'Não foi possível confirmar seus endereços. Tente novamente antes de finalizar.';
          feedback.className = 'coupon-feedback error';
        }
        document.getElementById('checkout-retry')?.focus();
        return;
      }

      const selectedAddressId = storeAddressSelect?.value || '';
      const selectedAddress = enderecosDaLoja.find((address) => String(address.id) === selectedAddressId);
      const selectedOption = storeAddressSelect?.selectedOptions[0];
      const selectedAddressText = selectedOption?.dataset.address || selectedOption?.textContent.trim() || '';
      if (!selectedAddress || !selectedAddressText) {
        if (feedback) {
          feedback.textContent = enderecosDaLoja.length
            ? 'Escolha o endereço de entrega no seletor do topo da loja.'
            : 'Cadastre um endereço no painel do cliente antes de finalizar.';
          feedback.className = 'coupon-feedback error';
        }
        if (enderecosDaLoja.length) storeAddressSelect?.focus();
        else document.getElementById('checkout-address-link')?.focus();
        return;
      }

      if (!PAYMENT_METHODS.includes(paymentSelect?.value)) {
        if (feedback) {
          feedback.textContent = 'Escolha sua forma de pagamento antes de finalizar o pedido.';
          feedback.className = 'coupon-feedback error';
        }
        paymentSelect?.focus();
        return;
      }
      if (paymentSelect.value === 'cartao') {
        await carregarCartaoSalvoLoja(true);
        if (checkoutLojaEmAndamento) return;
        if (!cartaoSalvoLoja) {
          atualizarAvisoCartaoSalvoLoja();
          document.getElementById('saved-card-payment-hint')?.focus();
          if (feedback) {
            feedback.textContent = estadoCartaoSalvoLoja === 'error'
              ? erroCartaoSalvoLoja
              : 'Cadastre um cartão em Dashboard > Formas de pagamento antes de finalizar pelo cartão.';
            feedback.className = 'coupon-feedback error';
          }
          return;
        }
      }

      const items = carrinhoItens.map((item) => ({
        productId: item.id,
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

      const subtotal = carrinhoItens.reduce((sum, item) => sum + item.preco * item.qty, 0);
      const desconto = cupomAplicado.codigo === couponCode ? subtotal * cupomAplicado.percentual / 100 : 0;
      const total = Math.max(0, subtotal - desconto);
      const paymentMethod = paymentSelect.value;
      checkoutLojaEmAndamento = true;
      atualizarBotaoFinalizarCompra();
      try {
        const includeCpfOnReceipt = await perguntarCpfNaNota();
        if (includeCpfOnReceipt === null) return;
      const paymentMethodLabels = {
        pix: 'Pix',
        cartao: 'Cartão',
      };
      const itensResumo = carrinhoItens.map((item) => {
        const unidade = item.saleUnit === 'Quilograma' ? 'kg' : 'un.';
        return `• ${item.nome} — ${formatarQuantidade(item.qty, item.saleUnit === 'Quilograma')} ${unidade} — ${formatarPreco(item.preco * item.qty)}`;
      });
      const resumoPedido = [
        'Confira seu pedido antes de confirmar:',
        '',
        ...itensResumo,
        '',
        `Subtotal: ${formatarPreco(subtotal)}`,
        `Desconto: ${formatarPreco(desconto)}`,
        'Frete: R$ 0,00',
        `Total: ${formatarPreco(total)}`,
        `Endereço: ${selectedAddressText}`,
        `Pagamento: ${paymentMethodLabels[paymentMethod]}`,
        `CPF na nota: ${includeCpfOnReceipt ? 'Sim' : 'Não'}`,
        '',
        'Ao continuar, você confirma os itens e as condições exibidas. Deseja enviar o pedido?',
      ].join('\n');
      if (!await confirmarPedidoLoja(resumoPedido)) return;

        const requestData = {
          items,
          address: selectedAddressText,
          addressId: selectedAddressId,
          paymentMethod,
          includeCpfOnReceipt,
          couponCode,
        };
        const requestSignature = JSON.stringify(requestData);
        if (!tentativaCheckoutId || assinaturaTentativaCheckout !== requestSignature) {
          if (typeof window.crypto?.randomUUID !== 'function') {
            throw new Error('Seu navegador não oferece suporte seguro para iniciar o pagamento. Atualize-o e tente novamente.');
          }
          tentativaCheckoutId = window.crypto.randomUUID();
          assinaturaTentativaCheckout = requestSignature;
        }

        if (feedback) {
          feedback.textContent = paymentMethod === 'cartao'
            ? 'Enviando o pedido com seu cartão salvo...'
            : 'Enviando seu pedido...';
          feedback.className = 'coupon-feedback';
        }
        const response = await fetch('/api/erp/orders', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            ...requestData,
            checkoutRequestId: tentativaCheckoutId,
            ...(paymentMethod === 'cartao' ? { useSavedCard: true } : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (response.status < 500) {
            tentativaCheckoutId = '';
            assinaturaTentativaCheckout = '';
          }
          throw new Error(data.error || 'Não foi possível registrar o pedido.');
        }
        tentativaCheckoutId = '';
        assinaturaTentativaCheckout = '';
        limparCarrinho();
        const paymentPending = data.order?.paymentStatus === 'pending';
        const pendingPix = paymentPending && data.order?.paymentMethod === 'pix';
        if (feedback) {
          feedback.textContent = data.message || 'Pedido registrado com sucesso.';
          feedback.className = paymentPending ? 'coupon-feedback' : 'coupon-feedback success';
          if (paymentPending) {
            feedback.append(' Acesse ');
            const ordersLink = document.createElement('a');
            ordersLink.href = '/dashboard/orders';
            ordersLink.textContent = 'Meus pedidos';
            feedback.append(ordersLink, pendingPix
              ? ' para copiar o código Pix e concluir o pagamento.'
              : ' para consultar o pagamento.');
          }
        }
        if (pendingPix) abrirDialogoPagamentoPix(data.order, data.message);
      } catch (error) {
        if (feedback) { feedback.textContent = error.message; feedback.className = 'coupon-feedback error'; }
      } finally {
        checkoutLojaEmAndamento = false;
        atualizarBotaoFinalizarCompra();
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
    cartTrigger.addEventListener('keydown', (event) => {
      if (cartTrigger.tagName === 'BUTTON' || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      abrirCarrinho();
    });
    cartPanel?.setAttribute('aria-hidden', 'true');
    cartPanel?.setAttribute('inert', '');
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && cartPanel?.classList.contains('open')) {
        event.preventDefault();
        fecharCarrinho();
      }
    });
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
        const response = await fetch('/api/coupons', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: valor }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível validar seus cupons.');
        const assignedCoupon = data?.coupon;
        if (!assignedCoupon || assignedCoupon.code !== valor) {
          throw new Error('Cupom inválido, expirado ou não enviado para sua conta.');
        }

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
        ajustarQuantidadeProduto(nome, 'remove');
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

function escapeStoreHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

function renderProductImage(image, title) {
  const source = String(image ?? '').trim();
  if (!source) {
    const accessibleTitle = escapeStoreHtml(title);
    return `<div class="product-image-placeholder" role="img" aria-label="Imagem de ${accessibleTitle} indisponível"><i data-lucide="image" aria-hidden="true"></i><span>Foto indisponível</span></div>`;
  }

  return `<img src="${escapeStoreHtml(source)}" alt="${escapeStoreHtml(title)}" class="product-img" loading="lazy" decoding="async">`;
}

function createProductImageFallback(title) {
  const fallback = document.createElement('div');
  fallback.className = 'product-image-placeholder';
  fallback.setAttribute('role', 'img');
  fallback.setAttribute('aria-label', `Imagem de ${title || 'produto'} indisponível`);
  fallback.innerHTML = '<i data-lucide="image" aria-hidden="true"></i><span>Foto indisponível</span>';
  return fallback;
}

document.addEventListener('error', (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.classList.contains('product-img')) return;
  image.replaceWith(createProductImageFallback(image.alt));
  if (window.lucide) window.lucide.createIcons();
}, true);

function getProductCardCategoryLabel(product) {
  const subcategory = String(product.subcategory || '').trim();
  const productType = String(product.productType || '').trim();
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const isBroadCategory = subcategory && (
    normalizarCatalogo(subcategory) === normalizarCatalogo(product.department)
    || categories.some((category) => normalizarCatalogo(category) === normalizarCatalogo(subcategory))
  );
  return (isBroadCategory ? productType : subcategory)
    || productType
    || String(product.collection || '').trim()
    || categories[0]
    || 'Produtos';
}

function getProductDiscountLabel(product) {
  const originalPrice = Number(product.price);
  const salePrice = Number(product.salePrice ?? originalPrice);
  if (!Number.isFinite(originalPrice) || originalPrice <= 0 || !Number.isFinite(salePrice) || salePrice >= originalPrice) return '';

  const configuredDiscount = Number(product.discount);
  const discount = Number.isFinite(configuredDiscount) && configuredDiscount > 0
    ? configuredDiscount
    : ((originalPrice - salePrice) / originalPrice) * 100;
  const roundedDiscount = Math.round(discount);
  return roundedDiscount > 0 ? `-${roundedDiscount}%` : '';
}

function renderProductBadges(product) {
  const selectedTypes = Array.isArray(product.featuredPriceTypes) ? product.featuredPriceTypes : [];
  const badges = [];
  const flashOfferActive = product.flashOfferActive === true;
  const discountLabel = flashOfferActive ? '' : getProductDiscountLabel(product);
  if (discountLabel) badges.push(`<span class="tag tag-discount">${discountLabel}</span>`);
  if (flashOfferActive) badges.push('<span class="tag tag-flash-offer">⚡ Relâmpago</span>');

  const showcaseTypes = [
    ['Oferta', 'tag-offer'],
    ['Promoção', 'tag-promotion'],
    ['Clube Hoje', 'tag-club'],
    ['Super Hoje', 'tag-super'],
  ];
  showcaseTypes.forEach(([type, className]) => {
    if (selectedTypes.some((selected) => normalizarCatalogo(selected) === normalizarCatalogo(type))) {
      badges.push(`<span class="tag ${className}">${escapeStoreHtml(type)}</span>`);
    }
  });

  return badges.length ? `<div class="product-badges" aria-label="Destaques do produto">${badges.join('')}</div>` : '';
}

function renderProductDepartmentBadge(product) {
  const department = String(product.department || '').trim();
  if (!department) return '';
  const label = escapeStoreHtml(department);
  return `<div class="product-category product-department" aria-label="Departamento: ${label}">${label}</div>`;
}

function produtoTemSeloDeVitrine(product, type) {
  return Array.isArray(product.featuredPriceTypes)
    && product.featuredPriceTypes.some((selected) => normalizarCatalogo(selected) === normalizarCatalogo(type));
}

function categoriaDoCarrossel(container) {
  const heading = container.closest('section')?.querySelector('h2, h3')?.textContent || '';
  const title = normalizarCatalogo(heading);
  if (title.includes('ofertas em destaque')) return 'ofertas';
  if (title.includes('mais vendidos')) return 'mais vendidos';
  if (title.includes('produtos de lavar roupa')) return 'lavanderia';
  if (title.includes('cervejas')) return 'cervejas';
  if (title.includes('acougue')) return 'acougue';
  const categories = ['hortifruti', 'acougue', 'carnes', 'padaria', 'laticinios', 'mercearia', 'bomboniere', 'sucos e refrigerantes', 'bebidas', 'bebidas alcoolicas', 'cervejas', 'vinhos', 'produtos de limpeza', 'limpeza', 'lavanderia', 'higiene pessoal', 'pet shop', 'bebes'];
  return categories.find((category) => title.includes(category));
}

function criarCardDoCatalogo(product) {
  const salePrice = Number(product.salePrice ?? product.price);
  const porKg = product.saleUnit === 'Quilograma';
  const price = `R$ ${salePrice.toFixed(2).replace('.', ',')}`;
  const oldPrice = salePrice < Number(product.price) ? ` <span class="old-price">R$ ${Number(product.price).toFixed(2).replace('.', ',')}</span>` : '';
  const category = escapeStoreHtml(getProductCardCategoryLabel(product));
  const title = escapeStoreHtml(product.title);
  const productId = escapeStoreHtml(product.id);
  return `<article class="product-card" data-id="${productId}" data-sale-unit="${porKg ? 'Quilograma' : 'Unidade'}">${renderProductBadges(product)}${renderProductImage(product.image, product.title)}<div class="product-category">${category}</div>${renderProductDepartmentBadge(product)}<div class="product-name">${title}</div><div class="product-price"><span class="product-price-current">${price}</span><span class="product-price-unit">${porKg ? 'por kg' : 'por unidade'}</span>${oldPrice}</div><div class="product-actions"><button class="btn-comprar" onclick="adicionarProduto(this)">Adicionar</button><div class="qty-controls"><button class="btn-remove" onclick="removerProduto(this)"><i data-lucide="trash-2"></i></button><span class="qty" data-quantity="${porKg ? '0.1' : '1'}">${porKg ? '100 g' : '1'}</span><button class="btn-add" onclick="aumentarQtd(this)">+</button></div></div></article>`;
}

const PRODUTOS_POR_LOTE = 8;
let produtosCatalogo = [];
let catalogoCarregado = false;
let estadosDosCarrosseis = new Map();
let observadorDeCarrosseis;

function criarBotaoCarregarMais(state) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'carousel-load-more';
  button.setAttribute('aria-label', `Carregar mais produtos de ${state.label}`);
  button.innerHTML = '<span class="carousel-load-more-icon" aria-hidden="true">+</span><span>Carregar mais</span>';
  button.addEventListener('click', () => renderizarProximoLote(state));
  state.container.append(button);
  state.loadButton = button;

  if (!('IntersectionObserver' in window)) return;
  if (!observadorDeCarrosseis) {
    observadorDeCarrosseis = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const currentState = [...estadosDosCarrosseis.values()].find((item) => item.loadButton === entry.target);
        if (currentState) renderizarProximoLote(currentState);
      });
    }, { root: state.container, rootMargin: '0px 48px', threshold: 0.1 });
  }
  observadorDeCarrosseis.observe(button);
}

function renderizarProximoLote(state) {
  if (state.loadButton) {
    observadorDeCarrosseis?.unobserve(state.loadButton);
    state.loadButton.remove();
    state.loadButton = null;
  }

  const start = state.renderedCount;
  const batch = state.products.slice(start, start + PRODUTOS_POR_LOTE);
  if (!batch.length) return;

  state.container.insertAdjacentHTML('beforeend', batch.map(criarCardDoCatalogo).join(''));
  state.renderedCount += batch.length;
  const cards = [...state.container.querySelectorAll('.product-card')].slice(start);
  cards.forEach((card) => {
    const image = card.querySelector('.product-img');
    if (image) {
      image.loading = 'lazy';
      image.decoding = 'async';
    }
  });
  adicionarCategoriasProdutos(cards);
  adicionarBotoesFavorito(cards, false);
  aplicarCarrinhoNosCartoes(carrinhoItens.map((item) => ({
    productId: item.id,
    name: item.nome,
    quantity: item.qty,
    saleUnit: item.saleUnit,
  })), cards);

  if (state.renderedCount < state.products.length) criarBotaoCarregarMais(state);
  if (window.lucide) window.lucide.createIcons();
}

function atualizarPrecosCarrinhoDoCatalogo(products) {
  if (!Array.isArray(products) || !carrinhoItens.length) return;
  const productsById = new Map(products.map((product) => [String(product.id), product]));
  const productsByName = new Map(products.map((product) => [normalizarCatalogo(product.title), product]));
  let changed = false;
  const updatedItems = carrinhoItens.map((item) => {
    const product = productsById.get(String(item.id)) || productsByName.get(normalizarCatalogo(item.nome));
    const currentPrice = Number(product?.salePrice ?? product?.price);
    if (!product || !Number.isFinite(currentPrice) || currentPrice <= 0) return item;
    const productId = String(product.id || item.id);
    if (productId === String(item.id) && Math.abs(currentPrice - item.preco) < 0.005) return item;
    changed = true;
    return {
      ...item,
      id: productId,
      preco: currentPrice,
      imagem: product.image || item.imagem,
    };
  });
  if (!changed) return;
  carrinhoItens = updatedItems;
  carrinhoRevision += 1;
  renderizarCarrinho();
}

function renderFlashOfferPanel(products) {
  const message = document.getElementById('flash-offer-message');
  const countdown = document.getElementById('flash-offer-countdown');
  const offerLink = document.getElementById('flash-offer-link');
  if (!message || !countdown || !offerLink) return;

  if (flashOfferCountdownTimer) window.clearInterval(flashOfferCountdownTimer);
  if (flashOfferRefreshTimer) window.clearTimeout(flashOfferRefreshTimer);

  const now = Date.now();
  const activeOffers = products.filter((product) => (
    product.flashOfferActive === true
    && Number.isFinite(Date.parse(product.flashOfferEndsAt))
    && Date.parse(product.flashOfferEndsAt) > now
  ));
  const scheduledOffers = products.filter((product) => (
    Number.isFinite(Date.parse(product.flashOfferScheduledStart))
    && Date.parse(product.flashOfferScheduledStart) > now
    && Number.isFinite(Date.parse(product.flashOfferEndsAt))
    && Date.parse(product.flashOfferEndsAt) > Date.parse(product.flashOfferScheduledStart)
  ));

  let deadline = null;
  if (activeOffers.length) {
    deadline = Math.min(...activeOffers.map((product) => Date.parse(product.flashOfferEndsAt)));
    message.textContent = activeOffers.length === 1
      ? '1 oferta relâmpago ativa. Termina em:'
      : `${activeOffers.length} ofertas relâmpago ativas. A próxima termina em:`;
    offerLink.hidden = false;
  } else if (scheduledOffers.length) {
    deadline = Math.min(...scheduledOffers.map((product) => Date.parse(product.flashOfferScheduledStart)));
    message.textContent = 'A próxima oferta relâmpago começa em:';
    offerLink.hidden = true;
  } else {
    message.textContent = 'Nenhuma oferta relâmpago ativa no momento. Volte em breve.';
    offerLink.hidden = true;
  }

  countdown.hidden = deadline === null;
  if (deadline === null) return;

  const updateCountdown = () => {
    const remainingSeconds = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
    if (remainingSeconds === 0) {
      if (flashOfferCountdownTimer) window.clearInterval(flashOfferCountdownTimer);
      message.textContent = 'Atualizando ofertas relâmpago...';
      flashOfferRefreshTimer = window.setTimeout(() => carregarCatalogoReal(), 800);
      return;
    }

    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    countdown.querySelector('[data-countdown-days]').textContent = String(days).padStart(2, '0');
    countdown.querySelector('[data-countdown-hours]').textContent = String(hours).padStart(2, '0');
    countdown.querySelector('[data-countdown-minutes]').textContent = String(minutes).padStart(2, '0');
    countdown.querySelector('[data-countdown-seconds]').textContent = String(seconds).padStart(2, '0');
  };

  updateCountdown();
  flashOfferCountdownTimer = window.setInterval(updateCountdown, 1000);
}

async function carregarCatalogoReal() {
  try {
    const carrossels = [...document.querySelectorAll('.offers-grid, .highlight-products, .products-grid, .carousel-track')];
    if (!carrossels.length) return;
    const response = await fetch('/api/products?purpose=store');
    if (!response.ok) throw new Error(`Falha ao carregar catálogo (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data?.products)) throw new Error('Resposta inválida ao carregar catálogo.');

    produtosCatalogo = data.products;
    atualizarPrecosCarrinhoDoCatalogo(data.products);
    renderFlashOfferPanel(data.products);
    catalogoCarregado = true;
    estadosDosCarrosseis = new Map();
    carrossels.forEach((container) => {
      const category = categoriaDoCarrossel(container);
      const isSalesCarousel = category === 'mais vendidos';
      const isOfferCarousel = category === 'ofertas';
      const heading = normalizarCatalogo(container.closest('section')?.querySelector('h2, h3')?.textContent || '');
      const visibleProducts = isSalesCarousel
        ? produtosCatalogo.filter((product) => Number(product.salesCount) > 0).sort((first, second) => Number(second.salesCount) - Number(first.salesCount))
        : isOfferCarousel
        ? produtosCatalogo.filter((product) => produtoTemSeloDeVitrine(product, 'Oferta'))
        : produtosCatalogo.filter((product) => {
          const hasCategory = category && product.categories?.some((item) => normalizarCatalogo(item) === category);
          const hasDepartment = category && normalizarCatalogo(product.department) === category;
          return hasCategory || hasDepartment;
        });
      container.innerHTML = '';
      container.setAttribute('aria-busy', 'false');
      const state = {
        container,
        products: visibleProducts,
        renderedCount: 0,
        loadButton: null,
        label: container.closest('section')?.querySelector('h2, h3')?.textContent.trim() || heading || 'loja',
      };
      estadosDosCarrosseis.set(container, state);
      renderizarProximoLote(state);
    });
    buildProductIndex();
  } catch (error) {
    console.warn('Catálogo real indisponível:', error.message);
    catalogoCarregado = false;
    adicionarCategoriasProdutos();
    buildProductIndex();
  }
}

async function carregarLayoutGerenciado() {
  if (!document.querySelector('[data-store-layout]')) return;

  try {
    const response = await fetch('/api/store-layout', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as imagens personalizadas.');

    const mainHeroSlides = (data.banners || []).filter(({ key }) => (
      key === 'main-hero' || /^main-hero-slide-\d{2,4}$/.test(key)
    ));
    configurarSlidesBannerPrincipal(mainHeroSlides);

    (data.banners || []).filter(({ key }) => key !== 'main-hero' && !key.startsWith('main-hero-slide-')).forEach(({ key, imageUrl }) => {
      const elements = document.querySelectorAll(`[data-store-layout="${key}"]`);
      if (!elements.length || !imageUrl) return;
      const image = `url("${imageUrl}")`;
      elements.forEach((element) => {
        if (element.tagName === 'IMG') {
          element.src = imageUrl;
          return;
        }
        const isCarouselBanner = key.startsWith('carousel-');
        element.style.backgroundImage = isCarouselBanner
          ? `linear-gradient(180deg, rgba(0, 0, 0, 0.34), rgba(0, 0, 0, 0.48)), ${image}`
          : image;
        element.style.backgroundSize = isCarouselBanner ? 'cover, contain' : 'contain';
        element.style.backgroundPosition = 'center';
        element.style.backgroundRepeat = 'no-repeat';
      });
    });
  } catch (error) {
    console.warn('Imagens personalizadas do layout indisponíveis:', error.message);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  inicializarCarrinho();
  carregarLayoutGerenciado();
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
  const cards = [...document.querySelectorAll('.product-card')];
  const cardsById = new Map(cards.filter((card) => card.dataset.id).map((card) => [card.dataset.id, card]));
  const cardsByName = new Map(cards.map((card) => [
    normalizarBusca(card.querySelector('.product-name')?.textContent.trim() || ''),
    card,
  ]));
  const products = catalogoCarregado
    ? produtosCatalogo
    : cards.map((card) => {
      const product = obterProdutoDoCartao(card);
      const oldPrice = card.querySelector('.old-price')?.textContent || '';
      const oldPriceValue = Number(String(oldPrice).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (product && Number.isFinite(oldPriceValue) && oldPriceValue > product.price) product.price = oldPriceValue;
      return product;
    }).filter(Boolean);

  _productIndex = products.map((product) => {
    const name = String(product.title || product.name || '').trim();
    const category = [
      ...(Array.isArray(product.categories) ? product.categories : []),
      product.department,
      product.subcategory,
      product.brand,
      product.productType,
      product.description,
    ].filter(Boolean).join(' ');
    const normalizedName = normalizarBusca(name);
    const card = (product.id && cardsById.get(String(product.id))) || cardsByName.get(normalizedName) || null;
    return {
      name,
      nameNormalized: normalizedName,
      category,
      categoryNormalized: normalizarBusca(category),
      categoryLabel: card?.querySelector('.product-category')?.textContent.trim() || getProductCardCategoryLabel(product),
      discountLabel: getProductDiscountLabel(product) || card?.querySelector('.tag-discount')?.textContent.trim() || '',
      product,
      card,
    };
  }).filter((item) => item.name);
  if (document.getElementById('search-input')?.value.trim()) buscarProdutos();
}

function garantirProdutoRenderizado(product) {
  const productId = String(product.id || product.productId || '');
  const name = normalizarBusca(product.title || product.name || product.nome || '');
  let card = [...document.querySelectorAll('.product-card')].find((item) => (
    (productId && item.dataset.id === productId)
    || normalizarBusca(item.querySelector('.product-name')?.textContent.trim() || '') === name
  ));
  if (card) return card;

  const state = [...estadosDosCarrosseis.values()].find((candidate) => candidate.products.some((item) => (
    (productId && String(item.id) === productId)
    || normalizarBusca(item.title || '') === name
  )));
  if (!state) return null;

  const productIndex = state.products.findIndex((item) => (
    (productId && String(item.id) === productId)
    || normalizarBusca(item.title || '') === name
  ));
  while (productIndex >= state.renderedCount) renderizarProximoLote(state);

  card = [...state.container.querySelectorAll('.product-card')].find((item) => (
    (productId && item.dataset.id === productId)
    || normalizarBusca(item.querySelector('.product-name')?.textContent.trim() || '') === name
  ));
  return card || null;
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
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    resultsBox.classList.remove('show');
    document.querySelector('.main-header')?.classList.remove('search-open');
    return;
  }

  const contentModeration = window.hojeContentModeration;
  const avisoBusca = (message) => {
    const notice = document.createElement('div');
    notice.className = 'search-empty search-moderation-error';
    notice.id = 'store-search-moderation-error';
    notice.setAttribute('role', 'status');
    const label = document.createElement('strong');
    label.textContent = message;
    notice.append(label);
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', notice.id);
    resultsBox.replaceChildren(notice);
    resultsBox.classList.add('show');
  };

  if (!contentModeration) {
    avisoBusca('Não foi possível validar a busca. Tente novamente mais tarde.');
    return;
  }

  if (contentModeration.containsOffensiveContent(input.value)) {
    avisoBusca('Remova termos ofensivos para continuar a busca.');
    return;
  }

  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');

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
    encontrados.forEach((indexedProduct) => {
      const { product, name } = indexedProduct;
      const nomeOriginal = name;
      const item = document.createElement('div');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.className = 'search-result-item';
      item.dataset.productName = nomeOriginal;

      const image = product.image || indexedProduct.card?.querySelector('.product-img')?.getAttribute('src') || '';
      const category = indexedProduct.categoryLabel || inferirCategoria(nomeOriginal);
      const price = Number(product.salePrice ?? product.price);
      const unitLabel = product.saleUnit === 'Quilograma' ? 'por kg' : 'por unidade';
      const priceLabel = Number.isFinite(price) ? `${formatarPreco(price)} · ${unitLabel}` : '';
      const discountLabel = indexedProduct.discountLabel;

      item.innerHTML = `
        <span class="search-result-image">${image ? `<img src="${escapeStoreHtml(image)}" alt="">` : '<i data-lucide="shopping-bag"></i>'}</span>
        <span class="search-result-info"><strong>${escapeStoreHtml(nomeOriginal)}</strong><small>${escapeStoreHtml(category)}</small>${discountLabel ? `<span class="search-result-discount">${escapeStoreHtml(discountLabel)}</span>` : ''}</span>
        <span class="search-result-price">${escapeStoreHtml(priceLabel)}</span>
        <span class="search-result-actions">
          <button type="button" class="search-buy">Adicionar</button>
          <span class="search-qty-controls">
            <button type="button" class="search-qty-remove" aria-label="Remover produto do carrinho"><i data-lucide="trash-2"></i></button>
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
        const cartIndex = encontrarIndiceCarrinho(product);
        const cartItem = cartIndex >= 0 ? carrinhoItens[cartIndex] : null;
        const ativo = Boolean(cartItem);
        buyButton.style.display = ativo ? 'none' : 'inline-flex';
        qtyControls.classList.toggle('show', ativo);
        qtyValue.textContent = cartItem
          ? formatarQuantidade(cartItem.qty, cartItem.saleUnit === 'Quilograma')
          : formatarQuantidade(product.saleUnit === 'Quilograma' ? 0.1 : 1, product.saleUnit === 'Quilograma');
      };

      buyButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const addedItem = alterarCarrinhoDoProduto(product, 'add');
        if (addedItem) exibirConfirmacaoCarrinho(nomeOriginal);
        atualizarQuantidadeBusca();
      });

      item.querySelector('.search-qty-plus').addEventListener('click', (event) => {
        event.stopPropagation();
        alterarCarrinhoDoProduto(product, 'increment');
        atualizarQuantidadeBusca();
      });

      const removeButton = item.querySelector('.search-qty-remove');
      removeButton.setAttribute('aria-label', `Remover ${nomeOriginal} do carrinho`);
      removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        alterarCarrinhoDoProduto(product, 'remove');
        atualizarQuantidadeBusca();
      });

      atualizarQuantidadeBusca();

      item.addEventListener('click', (event) => {
        if (event.target.closest('.search-result-actions')) return;
        const card = indexedProduct.card || garantirProdutoRenderizado(product);
        if (!card) return;
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('search-highlight');
        void card.offsetWidth;
        card.classList.add('search-highlight');
        input.value = nomeOriginal;
        resultsBox.classList.remove('show');
        document.querySelector('.main-header')?.classList.remove('search-open');
      });

      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          item.click();
        }
      });

      resultsBox.appendChild(item);

      const resultImage = item.querySelector('img');
      if (resultImage) {
        resultImage.addEventListener('error', () => {
          resultImage.remove();
          item.querySelector('.search-result-image')?.classList.add('is-missing');
        }, { once: true });
      }
    });
  }

  if (window.lucide) window.lucide.createIcons();
  resultsBox.classList.add('show');
  document.querySelector('.main-header')?.classList.add('search-open');
}

// Hook in: replace inline handlers by scheduling the debounced search
(function replaceSearchListeners() {
  const input = document.getElementById('search-input');
  const searchButton = document.getElementById('search-submit');
  if (input) {
    // remove inline handlers if present
    input.removeAttribute('oninput');
    input.removeAttribute('onfocus');
    input.addEventListener('input', scheduleBuscarProdutos);
    input.addEventListener('focus', scheduleBuscarProdutos);
    searchButton?.addEventListener('click', () => {
      input.focus();
      scheduleBuscarProdutos();
    });
  }
})();

// Ensure index built after content populated
window.addEventListener('DOMContentLoaded', () => {
  buildProductIndex();
});

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

// Fecha o menu de busca se a pessoa clicar em qualquer lugar fora dele
document.addEventListener('click', function(evento) {
  const box = document.getElementById('search-results');
  const input = document.getElementById('search-input');
  if (box && !box.contains(evento.target) && evento.target !== input) {
    box.classList.remove('show');
    document.querySelector('.main-header')?.classList.remove('search-open');
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