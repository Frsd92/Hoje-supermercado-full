(() => {
  const toggle = document.getElementById('store-assistant-toggle');
  const panel = document.getElementById('store-assistant-panel');
  const closeButton = document.getElementById('store-assistant-close');
  const form = document.getElementById('store-assistant-form');
  const input = document.getElementById('store-assistant-input');
  const messagesElement = document.getElementById('store-assistant-messages');
  if (!toggle || !panel || !closeButton || !form || !input || !messagesElement) return;

  const history = [];
  let busy = false;

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
    else toggle.focus();
  }

  function addMessage(text, type) {
    const message = document.createElement('div');
    message.className = `store-assistant-message ${type}`;
    message.textContent = text;
    messagesElement.append(message);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return message;
  }

  function addRecommendations(container, products) {
    if (!Array.isArray(products) || !products.length) return;
    const list = document.createElement('div');
    list.className = 'store-assistant-recommendations';
    products.forEach((product) => {
      const card = document.createElement('article');
      card.className = 'store-assistant-product';
      if (product.image) {
        const image = document.createElement('img');
        image.src = product.image;
        image.alt = '';
        image.loading = 'lazy';
        card.append(image);
      }
      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = product.title;
      const price = document.createElement('span');
      const formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(product.price);
      price.textContent = `${formattedPrice}${product.saleUnit === 'Quilograma' ? ' / kg' : ''}`;
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.textContent = product.saleUnit === 'Quilograma' ? 'Adicionar 100 g' : 'Adicionar 1';
      addButton.addEventListener('click', () => {
        if (typeof window.hojeAssistantAddToCart !== 'function' || !window.hojeAssistantAddToCart(product.id)) {
          addMessage('Não consegui adicionar agora. Confira se o catálogo terminou de carregar e tente novamente.', 'assistant');
          return;
        }
        addButton.disabled = true;
        addButton.textContent = 'Adicionado';
      });
      info.append(title, price, addButton);
      card.append(info);
      list.append(card);
    });
    container.append(list);
    const cartButton = document.createElement('button');
    cartButton.type = 'button';
    cartButton.className = 'store-assistant-cart-link';
    cartButton.textContent = 'Abrir meu carrinho';
    cartButton.addEventListener('click', () => window.hojeAssistantOpenCart?.());
    container.append(cartButton);
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  closeButton.addEventListener('click', () => setOpen(false));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || busy) return;

    busy = true;
    input.value = '';
    form.querySelector('button[type="submit"]').disabled = true;
    addMessage(message, 'customer');
    const pendingMessage = addMessage('Vou olhar isso pra você…', 'pending');
    try {
      if (!['http:', 'https:'].includes(window.location.protocol)) {
        throw new Error('O chat precisa do servidor da loja. Abra o site publicado ou inicie `npm run dev` na pasta dashboard-app.');
      }
      let response;
      try {
        response = await fetch('/api/store-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: history.slice(-8) }),
        });
      } catch {
        throw new Error('Não consegui conectar ao servidor da loja. Verifique sua conexão e tente novamente.');
      }
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('O servidor da loja não retornou uma resposta válida. Abra o site publicado ou use o servidor local.');
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Não consegui ler a resposta do chat. Tente novamente em instantes.');
      }
      pendingMessage.remove();
      if (!response.ok) throw new Error(data.error || 'Não consegui responder agora. Tente novamente.');
      const answer = addMessage(data.reply, 'assistant');
      addRecommendations(answer, data.recommendations);
      history.push({ role: 'user', text: message }, { role: 'model', text: data.reply });
      if (history.length > 8) history.splice(0, history.length - 8);
    } catch (error) {
      pendingMessage.remove();
      addMessage(error.message || 'O chat está temporariamente indisponível. Tente novamente.', 'assistant error');
    } finally {
      busy = false;
      form.querySelector('button[type="submit"]').disabled = false;
      input.focus();
    }
  });
})();
