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
  const metaPixelPagePaths = new Set([
    '/',
    '/index.html',
    '/categoria.html',
    '/sobre-nos.html',
    '/politica-de-privacidade.html',
    '/termos-de-uso.html',
  ]);
  const canLoadMetaPixel = () => metaPixel.enabled && metaPixelPagePaths.has(window.location.pathname);

  if ((!hotjar.enabled && !metaPixel.enabled) || document.getElementById('hoje-analytics-controls')) return;

  const style = document.createElement('style');
  style.textContent = `
    #hoje-analytics-controls [hidden] { display: none !important; }
    #hoje-analytics-controls .privacy-consent-panel {
      position: fixed;
      z-index: 2147483000;
      left: 16px;
      bottom: 16px;
      width: min(440px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow-y: auto;
      padding: 20px;
      border: 1px solid #d9e5dc;
      border-radius: 16px;
      color: #183b2b;
      background: #fff;
      box-shadow: 0 12px 40px rgba(0, 0, 0, .24);
      font: 400 14px/1.5 system-ui, sans-serif;
    }
    #hoje-analytics-controls .privacy-consent-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    #hoje-analytics-controls h2 {
      margin: 0;
      color: inherit;
      font: 800 17px/1.3 system-ui, sans-serif;
    }
    #hoje-analytics-controls h3 {
      margin: 14px 0 4px;
      color: inherit;
      font: 700 14px/1.4 system-ui, sans-serif;
    }
    #hoje-analytics-controls p { margin: 8px 0; }
    #hoje-analytics-controls .privacy-consent-status {
      padding: 8px 10px;
      border-radius: 8px;
      color: #7a341c;
      background: #fff4e8;
    }
    #hoje-analytics-controls .privacy-consent-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    #hoje-analytics-controls button {
      min-height: 44px;
      padding: 9px 12px;
      border: 1px solid #8da294;
      border-radius: 9px;
      color: #183b2b;
      background: #fff;
      font: 700 13px/1.2 system-ui, sans-serif;
      cursor: pointer;
    }
    #hoje-analytics-controls .privacy-consent-close {
      min-width: 44px;
      min-height: 44px;
      padding: 0;
      border-color: transparent;
      font-size: 22px;
    }
    #hoje-analytics-controls button:hover { background: #eef6f0; }
    #hoje-analytics-controls button:focus-visible,
    #hoje-analytics-controls a:focus-visible {
      outline: 3px solid #b18127;
      outline-offset: 3px;
    }
    #hoje-analytics-controls a { color: #145c38; font-weight: 700; }
    @media (max-width: 520px) {
      #hoje-analytics-controls .privacy-consent-panel {
        right: 8px;
        bottom: 8px;
        left: 8px;
        width: auto;
        padding: 16px;
      }
    }
  `;
  document.head.appendChild(style);

  const controls = document.createElement('div');
  controls.id = 'hoje-analytics-controls';
  controls.innerHTML = `
    <section class="privacy-consent-panel" id="hoje-analytics-panel" role="dialog" aria-labelledby="hoje-analytics-title" aria-describedby="hoje-analytics-description">
      <div class="privacy-consent-heading">
        <h2 id="hoje-analytics-title">Preferências de privacidade</h2>
        <button class="privacy-consent-close" type="button" aria-label="Fechar preferências">×</button>
      </div>
      <p id="hoje-analytics-description">Escolha separadamente se autoriza analytics de usabilidade e medição de anúncios. As escolhas são opcionais e não afetam as funções da Loja ou da sua conta.</p>
      <h3>Analytics de usabilidade (Hotjar)</h3>
      <p>Ajuda a entender cliques, rolagem e navegação para melhorar a experiência. Textos em áreas da conta são suprimidos nas gravações.</p>
      <p data-consent-status="analytics"></p>
      <div class="privacy-consent-actions">
        <button type="button" data-consent-category="analytics" data-consent-choice="accepted">Aceitar analytics</button>
        <button type="button" data-consent-category="analytics" data-consent-choice="rejected">Recusar analytics</button>
      </div>
      <h3>Medição de anúncios da Meta (Pixel)</h3>
      <p>Permite medir visitas e campanhas da Meta, além de ajudar a criar públicos e otimizar anúncios. A Meta recebe dados de navegação e do dispositivo; não enviamos dados de perfil, CPF ou pagamento.</p>
      <p data-consent-status="marketing"></p>
      <div class="privacy-consent-actions">
        <button type="button" data-consent-category="marketing" data-consent-choice="accepted">Aceitar medição de anúncios</button>
        <button type="button" data-consent-category="marketing" data-consent-choice="rejected">Recusar medição de anúncios</button>
      </div>
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
      ? 'Analytics autorizado.'
      : analyticsPreference === 'rejected' ? 'Analytics recusado.' : 'Ainda não escolhido.';
    marketingStatus.textContent = marketingPreference === 'accepted'
      ? 'Medição de anúncios autorizada.'
      : marketingPreference === 'rejected' ? 'Medição de anúncios recusada.' : 'Ainda não escolhido.';
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
    if (marketingPreference !== 'accepted' || !canLoadMetaPixel() || typeof window.fbq !== 'function') return;
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
  window.dispatchEvent(new CustomEvent('hoje-analytics-preferences-ready'));
  window.dispatchEvent(new CustomEvent('hoje-analytics-consent-changed', { detail: { choice: analyticsPreference } }));
  window.dispatchEvent(new CustomEvent('hoje-marketing-consent-changed', { detail: { choice: marketingPreference } }));
  if (analyticsPreference === 'accepted' && hotjar.enabled) loadHotjar();
  if (marketingPreference === 'accepted' && canLoadMetaPixel()) loadMetaPixel();
})();
