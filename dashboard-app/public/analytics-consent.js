(function () {
  const hotjar = {
    enabled: true,
    hjid: 6788464,
    hjsv: 6,
  };
  const metaPixel = {
    enabled: true,
    id: '2042883969747267',
  };
  const consentKeys = {
    analytics: 'hoje-analytics-consent-v1',
    marketing: 'hoje-marketing-consent-v1',
  };
  const metaPixelEventNames = new Set(['AddToCart', 'InitiateCheckout', 'Purchase']);
  const metaPixelParameterNames = new Set(['content_ids', 'content_type', 'contents', 'value', 'currency']);
  const metaPixelPagePaths = new Set([
    '/',
    '/index.html',
    '/categoria.html',
    '/sobre-nos.html',
    '/politica-de-privacidade.html',
    '/termos-de-uso.html',
  ]);
  const metaPixelEventPagePaths = new Set([...metaPixelPagePaths, '/dashboard/orders']);
  const canLoadMetaPixel = () => metaPixel.enabled && metaPixelEventPagePaths.has(window.location.pathname);

  if ((!hotjar.enabled && !metaPixel.enabled) || document.getElementById('hoje-analytics-controls')) return;

  const style = document.createElement('style');
  style.textContent = `
    #hoje-analytics-controls [hidden] { display: none !important; }
    #hoje-analytics-controls,
    #hoje-analytics-controls * { box-sizing: border-box; }
    #hoje-analytics-controls .privacy-consent-panel {
      position: fixed;
      z-index: 2147483000;
      left: 16px;
      bottom: 16px;
      width: min(460px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 32px));
      overflow-y: auto;
      padding: 22px;
      border: 1px solid #d5e2d9;
      border-radius: 20px;
      color: #183b2b;
      background: #fff;
      box-shadow: 0 18px 56px rgba(18, 54, 35, .22);
      font: 400 14px/1.5 system-ui, sans-serif;
    }
    #hoje-analytics-controls .privacy-consent-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    #hoje-analytics-controls .privacy-consent-kicker {
      margin: 0 0 4px;
      color: #52705e;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    #hoje-analytics-controls h2 {
      margin: 0;
      color: inherit;
      font: 800 20px/1.25 system-ui, sans-serif;
    }
    #hoje-analytics-controls h3 {
      margin: 0;
      color: inherit;
      font: 750 15px/1.35 system-ui, sans-serif;
    }
    #hoje-analytics-controls p { margin: 8px 0 0; }
    #hoje-analytics-controls .privacy-consent-intro {
      margin: 10px 0 16px;
      color: #456251;
    }
    #hoje-analytics-controls .privacy-consent-option {
      margin-top: 12px;
      padding: 14px;
      border: 1px solid #dce7df;
      border-radius: 14px;
      background: #f8fbf8;
    }
    #hoje-analytics-controls .privacy-consent-option p { color: #405d4c; }
    #hoje-analytics-controls .privacy-consent-option-status {
      min-height: 21px;
      color: #526e5c;
      font-size: 12px;
      font-weight: 600;
    }
    #hoje-analytics-controls .privacy-consent-status {
      padding: 8px 10px;
      border-radius: 8px;
      color: #7a341c;
      background: #fff4e8;
    }
    #hoje-analytics-controls .privacy-consent-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    #hoje-analytics-controls button {
      min-width: 0;
      min-height: 46px;
      padding: 10px;
      border: 1px solid #8da294;
      border-radius: 10px;
      color: #183b2b;
      background: #fff;
      font: 700 13px/1.25 system-ui, sans-serif;
      cursor: pointer;
    }
    #hoje-analytics-controls .privacy-consent-close {
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-color: transparent;
      font-size: 22px;
    }
    #hoje-analytics-controls .privacy-consent-actions button:hover,
    #hoje-analytics-controls .privacy-consent-close:hover { background: #eef6f0; }
    #hoje-analytics-controls button:focus-visible,
    #hoje-analytics-controls a:focus-visible {
      outline: 3px solid #b18127;
      outline-offset: 3px;
    }
    #hoje-analytics-controls a {
      display: inline-block;
      margin-top: 14px;
      color: #145c38;
      font-weight: 700;
    }
    @media (max-width: 520px) {
      #hoje-analytics-controls .privacy-consent-panel {
        right: 8px;
        bottom: 8px;
        left: 8px;
        width: auto;
        max-height: calc(100dvh - 16px);
        padding: 16px;
        border-radius: 18px;
      }
      #hoje-analytics-controls h2 { font-size: 18px; }
      #hoje-analytics-controls .privacy-consent-option { padding: 12px; }
    }
  `;
  document.head.appendChild(style);

  const controls = document.createElement('div');
  controls.id = 'hoje-analytics-controls';
  controls.innerHTML = `
    <section class="privacy-consent-panel" id="hoje-analytics-panel" role="dialog" aria-labelledby="hoje-analytics-title" aria-describedby="hoje-analytics-description">
      <div class="privacy-consent-heading">
        <div>
          <p class="privacy-consent-kicker">Sua privacidade</p>
          <h2 id="hoje-analytics-title">Escolha suas preferências</h2>
        </div>
        <button class="privacy-consent-close" type="button" aria-label="Fechar preferências">×</button>
      </div>
      <p class="privacy-consent-intro" id="hoje-analytics-description">As duas opções são independentes. Você pode aceitar ou recusar cada uma; sua escolha não muda o acesso à Loja ou à sua conta.</p>
      <section class="privacy-consent-option" aria-labelledby="hoje-hotjar-title">
        <h3 id="hoje-hotjar-title">Analytics de usabilidade (Hotjar)</h3>
        <p>Ajuda a entender a navegação para melhorar a experiência. Textos em áreas da conta são suprimidos nas gravações.</p>
        <p class="privacy-consent-option-status" data-consent-status="analytics" aria-live="polite"></p>
        <div class="privacy-consent-actions" role="group" aria-label="Escolha sobre analytics de usabilidade">
          <button type="button" data-consent-category="analytics" data-consent-choice="accepted">Permitir Hotjar</button>
          <button type="button" data-consent-category="analytics" data-consent-choice="rejected">Não permitir</button>
        </div>
      </section>
      <section class="privacy-consent-option" aria-labelledby="hoje-meta-title">
        <h3 id="hoje-meta-title">Medição de anúncios da Meta (Pixel)</h3>
        <p>Ajuda a medir campanhas e melhorar anúncios com dados de navegação e eventos de produtos, carrinho e compras. Não enviamos dados de perfil, CPF, endereço ou pagamento.</p>
        <p class="privacy-consent-option-status" data-consent-status="marketing" aria-live="polite"></p>
        <div class="privacy-consent-actions" role="group" aria-label="Escolha sobre medição de anúncios da Meta">
          <button type="button" data-consent-category="marketing" data-consent-choice="accepted">Permitir Meta Pixel</button>
          <button type="button" data-consent-category="marketing" data-consent-choice="rejected">Não permitir</button>
        </div>
      </section>
      <p class="privacy-consent-status" role="status" aria-live="polite" hidden></p>
      <p><a href="/politica-de-privacidade.html">Leia a Política de Privacidade</a></p>
    </section>
  `;
  document.body.appendChild(controls);
  const panel = controls.querySelector('.privacy-consent-panel');
  const closeButton = controls.querySelector('.privacy-consent-close');
  const status = controls.querySelector('.privacy-consent-status');
  const analyticsStatus = controls.querySelector('[data-consent-status="analytics"]');
  const marketingStatus = controls.querySelector('[data-consent-status="marketing"]');
  let analyticsPreference = null;
  let marketingPreference = null;
  let returnFocus = null;

  function readPreference(key) {
    try {
      const saved = window.localStorage.getItem(key);
      return saved === 'accepted' || saved === 'rejected' ? saved : null;
    } catch (error) {
      console.error('Não foi possível ler uma preferência de privacidade.', error);
      status.textContent = 'Não foi possível ler as preferências salvas. Os serviços opcionais ficarão desativados até você escolher nesta página.';
      status.hidden = false;
      return null;
    }
  }

  function updatePreferenceLabels() {
    analyticsStatus.textContent = analyticsPreference === 'accepted'
      ? 'Sua escolha: permitido.'
      : analyticsPreference === 'rejected' ? 'Sua escolha: não permitido.' : 'Ainda não escolhido.';
    marketingStatus.textContent = marketingPreference === 'accepted'
      ? 'Sua escolha: permitido.'
      : marketingPreference === 'rejected' ? 'Sua escolha: não permitido.' : 'Ainda não escolhido.';
    panel.hidden = analyticsPreference !== null && marketingPreference !== null;
  }

  function loadHotjar() {
    window.hj = window.hj || function () {
      (window.hj.q = window.hj.q || []).push(arguments);
    };
    window._hjSettings = { hjid: hotjar.hjid, hjsv: hotjar.hjsv };
    window.hj('consent', true);

    if (window.__hojeHotjarScriptRequested) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://static.hotjar.com/c/hotjar-${hotjar.hjid}.js?sv=${hotjar.hjsv}`;
    window.__hojeHotjarScriptRequested = true;
    script.onerror = (error) => {
      window.__hojeHotjarScriptRequested = false;
      console.error('Não foi possível carregar o script do Hotjar.', error);
      status.textContent = 'Não foi possível carregar o Hotjar. As funções do site continuam disponíveis.';
      status.hidden = false;
      panel.hidden = false;
    };
    document.head.appendChild(script);
  }

  function trackMetaPageView() {
    if (marketingPreference !== 'accepted' || !metaPixelPagePaths.has(window.location.pathname)
      || typeof window.fbq !== 'function') return;
    const pageUrl = window.location.href;
    if (window.__hojeMetaPixelLastPageView === pageUrl) return;
    window.__hojeMetaPixelLastPageView = pageUrl;
    window.fbq('track', 'PageView');
  }

  function loadMetaPixel() {
    if (!canLoadMetaPixel()) return;

    window.fbq = window.fbq || function () {
      window.fbq.callMethod
        ? window.fbq.callMethod.apply(window.fbq, arguments)
        : window.fbq.queue.push(arguments);
    };
    window.fbq.queue = window.fbq.queue || [];
    window.fbq.loaded = true;
    window.fbq.version = '2.0';
    window._fbq = window._fbq || window.fbq;
    window.fbq('consent', 'grant');

    if (!window.__hojeMetaPixelInitialized) {
      window.fbq('init', metaPixel.id);
      window.__hojeMetaPixelInitialized = true;
    }

    if (!window.__hojeMetaPixelScriptRequested) {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://connect.facebook.net/en_US/fbevents.js';
      window.__hojeMetaPixelScriptRequested = true;
      script.onerror = (error) => {
        window.__hojeMetaPixelScriptRequested = false;
        console.error('Não foi possível carregar o Meta Pixel.', error);
        status.textContent = 'Não foi possível carregar o Pixel da Meta. As funções do site continuam disponíveis.';
        status.hidden = false;
        panel.hidden = false;
      };
      document.head.appendChild(script);
    }

    trackMetaPageView();
  }

  function trackMetaEvent(eventName, parameters = {}) {
    if (
      !metaPixelEventNames.has(eventName)
      || marketingPreference !== 'accepted'
      || !canLoadMetaPixel()
    ) return false;

    loadMetaPixel();
    const safeParameters = {};
    for (const [key, value] of Object.entries(parameters)) {
      if (!metaPixelParameterNames.has(key)) continue;
      if (key === 'value') {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue) && numericValue >= 0) safeParameters.value = numericValue;
      } else if (key === 'currency' && value === 'BRL') {
        safeParameters.currency = value;
      } else if (key === 'content_type' && value === 'product') {
        safeParameters.content_type = value;
      } else if (key === 'content_ids' && Array.isArray(value)) {
        safeParameters.content_ids = value
          .filter((id) => typeof id === 'string' || typeof id === 'number')
          .map(String)
          .filter((id) => id.length > 0 && id.length <= 100)
          .slice(0, 100);
      } else if (key === 'contents' && Array.isArray(value)) {
        safeParameters.contents = value.slice(0, 100).flatMap((item) => {
          if (!item || typeof item !== 'object') return [];
          const id = String(item.id ?? '');
          const quantity = Number(item.quantity);
          const itemPrice = Number(item.item_price);
          if (!id || id.length > 100 || !Number.isFinite(quantity) || quantity <= 0
            || !Number.isFinite(itemPrice) || itemPrice < 0) return [];
          return [{ id, quantity, item_price: itemPrice }];
        });
      }
    }

    window.fbq('track', eventName, safeParameters);
    return true;
  }

  function savePreference(category, nextPreference) {
    const key = consentKeys[category];
    try {
      window.localStorage.setItem(key, nextPreference);
      return true;
    } catch (error) {
      console.error(`Não foi possível salvar a preferência de ${category}.`, error);
      status.textContent = 'Não foi possível salvar sua escolha. Ela valerá somente nesta página.';
      status.hidden = false;
      return false;
    }
  }

  function closePanel() {
    panel.hidden = true;
    const focusTarget = returnFocus?.isConnected ? returnFocus : controls.querySelector('a');
    focusTarget?.focus();
    returnFocus = null;
  }

  function openPreferences() {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    status.hidden = true;
    panel.hidden = false;
    controls.querySelector('[data-consent-choice="accepted"]')?.focus();
  }

  function setPreference(category, nextPreference) {
    if (category === 'analytics') {
      analyticsPreference = nextPreference;
    } else if (category === 'marketing') {
      marketingPreference = nextPreference;
    } else {
      return;
    }

    const saved = savePreference(category, nextPreference);
    if (category === 'analytics') {
      window.dispatchEvent(new CustomEvent('hoje-analytics-consent-changed', { detail: { choice: nextPreference } }));
      if (nextPreference === 'accepted' && hotjar.enabled) {
        loadHotjar();
      } else if (typeof window.hj === 'function') {
        window.hj('consent', false);
      }
    } else {
      window.dispatchEvent(new CustomEvent('hoje-marketing-consent-changed', { detail: { choice: nextPreference } }));
      if (nextPreference === 'accepted' && canLoadMetaPixel()) {
        loadMetaPixel();
      } else if (typeof window.fbq === 'function') {
        window.fbq('consent', 'revoke');
        window.__hojeMetaPixelLastPageView = null;
      }
    }

    updatePreferenceLabels();
    if (saved && analyticsPreference !== null && marketingPreference !== null) {
      status.hidden = true;
      closePanel();
    } else if (!saved) {
      panel.hidden = false;
    }
  }

  document.querySelectorAll('[data-analytics-settings-link]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openPreferences();
    });
  });
  closeButton.addEventListener('click', closePanel);
  controls.querySelectorAll('[data-consent-category][data-consent-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      setPreference(button.dataset.consentCategory, button.dataset.consentChoice);
    });
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });
  window.addEventListener('hoje-page-view', trackMetaPageView);

  analyticsPreference = readPreference(consentKeys.analytics);
  marketingPreference = readPreference(consentKeys.marketing);
  updatePreferenceLabels();
  window.hojeAnalyticsPreferences = {
    open: openPreferences,
    getChoice: () => analyticsPreference,
    getMarketingChoice: () => marketingPreference,
  };
  window.hojeMetaTrack = trackMetaEvent;
  window.dispatchEvent(new CustomEvent('hoje-analytics-preferences-ready'));
  window.dispatchEvent(new CustomEvent('hoje-analytics-consent-changed', { detail: { choice: analyticsPreference } }));
  window.dispatchEvent(new CustomEvent('hoje-marketing-consent-changed', { detail: { choice: marketingPreference } }));
  if (analyticsPreference === 'accepted' && hotjar.enabled) loadHotjar();
  if (marketingPreference === 'accepted' && metaPixelPagePaths.has(window.location.pathname)) loadMetaPixel();
})();
