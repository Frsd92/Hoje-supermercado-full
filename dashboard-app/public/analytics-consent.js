(function () {
  const hotjar = {
    enabled: true,
    hjid: 6788464,
    hjsv: 6,
  };
  const consentKey = 'hoje-analytics-consent-v1';

  if (!hotjar.enabled || document.getElementById('hoje-analytics-controls')) return;

  const style = document.createElement('style');
  style.textContent = `
    #hoje-analytics-controls [hidden] { display: none !important; }
    #hoje-analytics-controls .privacy-consent-panel {
      position: fixed;
      z-index: 2147483000;
      left: 16px;
      bottom: 16px;
      width: min(440px, calc(100vw - 32px));
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
    #hoje-analytics-controls p { margin: 10px 0; }
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
      margin-top: 14px;
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
        <h2 id="hoje-analytics-title">Preferências de analytics</h2>
        <button class="privacy-consent-close" type="button" aria-label="Fechar preferências">×</button>
      </div>
      <p id="hoje-analytics-description">O Hotjar ajuda a entender cliques, rolagem e navegação para melhorar a experiência. No painel do cliente, os textos ficam ocultos nas gravações. Essa escolha é opcional e não afeta as funções da conta.</p>
      <p class="privacy-consent-status" role="status" aria-live="polite" hidden></p>
      <div class="privacy-consent-actions">
        <button type="button" data-analytics-choice="accepted">Aceitar analytics</button>
        <button type="button" data-analytics-choice="rejected">Recusar analytics</button>
      </div>
      <p><a href="/politica-de-privacidade.html">Leia a Política de Privacidade</a></p>
    </section>
  `;
  document.body.appendChild(controls);
  const panel = controls.querySelector('.privacy-consent-panel');
  const closeButton = controls.querySelector('.privacy-consent-close');
  const status = controls.querySelector('.privacy-consent-status');
  const acceptButton = controls.querySelector('[data-analytics-choice="accepted"]');
  const rejectButton = controls.querySelector('[data-analytics-choice="rejected"]');
  let preference = null;
  let returnFocus = null;

  function readPreference() {
    try {
      const saved = window.localStorage.getItem(consentKey);
      return saved === 'accepted' || saved === 'rejected' ? saved : null;
    } catch (error) {
      console.error('Não foi possível ler a preferência de analytics.', error);
      status.textContent = 'Não foi possível ler sua preferência salva. O Hotjar ficará desativado até você escolher nesta página.';
      status.hidden = false;
      return null;
    }
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
      status.textContent = 'Não foi possível carregar o analytics. As funções do site continuam disponíveis.';
      status.hidden = false;
      panel.hidden = false;
    };
    document.head.appendChild(script);
  }

  function savePreference(nextPreference) {
    try {
      window.localStorage.setItem(consentKey, nextPreference);
      return true;
    } catch (error) {
      console.error('Não foi possível salvar a preferência de analytics.', error);
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
    acceptButton.focus();
  }

  function setPreference(nextPreference) {
    preference = nextPreference;
    const saved = savePreference(nextPreference);
    window.dispatchEvent(new CustomEvent('hoje-analytics-consent-changed', { detail: { choice: preference } }));

    if (nextPreference === 'accepted') {
      loadHotjar();
    } else if (typeof window.hj === 'function') {
      window.hj('consent', false);
    }

    rejectButton.textContent = nextPreference === 'accepted' ? 'Revogar analytics' : 'Recusar analytics';
    if (saved) {
      status.hidden = true;
      closePanel();
    } else {
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
  controls.querySelectorAll('[data-analytics-choice]').forEach((button) => {
    button.addEventListener('click', () => setPreference(button.dataset.analyticsChoice));
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closePanel();
  });

  preference = readPreference();
  rejectButton.textContent = preference === 'accepted' ? 'Revogar analytics' : 'Recusar analytics';
  panel.hidden = preference !== null;
  window.hojeAnalyticsPreferences = {
    open: openPreferences,
    getChoice: () => preference,
  };
  window.dispatchEvent(new CustomEvent('hoje-analytics-preferences-ready'));
  window.dispatchEvent(new CustomEvent('hoje-analytics-consent-changed', { detail: { choice: preference } }));
  if (preference === 'accepted') loadHotjar();
})();
