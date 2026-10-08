(function () {
  if (window.__hojeStorePresenceStarted) return;
  window.__hojeStorePresenceStarted = true;

  const heartbeatMs = 30_000;
  let lastErrorAt = 0;

  async function sendHeartbeat() {
    if (document.visibilityState && document.visibilityState !== 'visible') return;

    try {
      const response = await fetch('/api/store-presence', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        keepalive: true,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      lastErrorAt = 0;
    } catch (error) {
      if (Date.now() - lastErrorAt >= 60_000) {
        console.error('Não foi possível atualizar a presença anônima da Loja.', error);
        lastErrorAt = Date.now();
      }
    }
  }

  sendHeartbeat();
  window.setInterval(sendHeartbeat, heartbeatMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendHeartbeat();
  });
})();
