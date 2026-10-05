(() => {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .catch((error) => {
        console.error('Não foi possível preparar a loja para uso offline:', error);
      });
  });
})();
