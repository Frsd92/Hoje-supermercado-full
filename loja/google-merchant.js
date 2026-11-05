(function () {
  const merchantId = 5873992786;
  const renderedOrderIds = new Set();
  const pendingOptIns = [];
  let surveyApiReady = false;
  let surveyScriptRequested = false;

  function reportIntegrationError(message, error) {
    console.error(`[Google Merchant] ${message}`, error || '');
  }

  function startMerchantWidget() {
    const widgetScript = document.createElement('script');
    widgetScript.id = 'merchantWidgetScript';
    widgetScript.src = 'https://www.gstatic.com/shopping/merchant/merchantwidget.js';
    widgetScript.defer = true;
    widgetScript.addEventListener('load', function () {
      if (!window.merchantwidget || typeof window.merchantwidget.start !== 'function') {
        reportIntegrationError('A biblioteca do selo foi carregada, mas a API não está disponível.');
        return;
      }

      window.merchantwidget.start({
        merchant_id: merchantId,
        position: 'RIGHT_BOTTOM',
        region: 'BR',
      });
    });
    widgetScript.addEventListener('error', function () {
      reportIntegrationError('Não foi possível carregar o selo.');
    });
    document.head.appendChild(widgetScript);
  }

  function renderPendingOptIns() {
    if (!surveyApiReady || !pendingOptIns.length) return;
    const optIns = pendingOptIns.splice(0);

    window.gapi.load('surveyoptin', function () {
      if (!window.gapi.surveyoptin || typeof window.gapi.surveyoptin.render !== 'function') {
        reportIntegrationError('A API do convite de avaliação não está disponível.');
        return;
      }

      optIns.forEach((optIn) => {
        window.gapi.surveyoptin.render({
          merchant_id: merchantId,
          order_id: optIn.orderId,
          email: optIn.email,
          delivery_country: 'BR',
          estimated_delivery_date: optIn.estimatedDeliveryDate,
        });
      });
    });
  }

  window.renderOptIn = function () {
    if (!window.gapi || typeof window.gapi.load !== 'function') {
      reportIntegrationError('A biblioteca de avaliações foi carregada sem disponibilizar a API.');
      return;
    }

    surveyApiReady = true;
    renderPendingOptIns();
  };

  function loadSurveyApi() {
    if (surveyScriptRequested) return;
    surveyScriptRequested = true;

    const surveyScript = document.createElement('script');
    surveyScript.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
    surveyScript.async = true;
    surveyScript.defer = true;
    surveyScript.addEventListener('error', function () {
      reportIntegrationError('Não foi possível carregar o convite de avaliação.');
    });
    document.head.appendChild(surveyScript);
  }

  function estimateDeliveryDate(orderDate) {
    const parsedDate = new Date(orderDate);
    if (!orderDate || Number.isNaN(parsedDate.getTime())) return '';

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(parsedDate);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const deliveryDate = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + 1));

    return [
      deliveryDate.getUTCFullYear(),
      String(deliveryDate.getUTCMonth() + 1).padStart(2, '0'),
      String(deliveryDate.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  window.hojeGoogleMerchant = {
    renderOptIn({ orderId, email, orderDate }) {
      const normalizedOrderId = String(orderId || '').trim();
      const normalizedEmail = String(email || '').trim();
      const estimatedDeliveryDate = estimateDeliveryDate(orderDate);

      if (!normalizedOrderId || !normalizedEmail || !estimatedDeliveryDate) {
        reportIntegrationError('O convite não foi exibido porque faltam dados obrigatórios do pedido.');
        return;
      }
      if (renderedOrderIds.has(normalizedOrderId)) return;

      renderedOrderIds.add(normalizedOrderId);
      pendingOptIns.push({
        orderId: normalizedOrderId,
        email: normalizedEmail,
        estimatedDeliveryDate,
      });
      loadSurveyApi();
      renderPendingOptIns();
    },
  };

  startMerchantWidget();
})();
