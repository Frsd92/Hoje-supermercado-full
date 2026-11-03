(() => {
  const installButton = document.querySelector('#install-app-button');
  const installDialog = document.querySelector('#install-app-dialog');
  const closeDialogButton = document.querySelector('#install-app-dialog-close');
  let installPromptEvent = null;

  const appIsInstalled = () => (
    window.matchMedia('(display-mode: standalone)').matches
    || navigator.standalone === true
  );

  const showInstallInstructions = () => {
    if (installDialog && typeof installDialog.showModal === 'function') {
      if (!installDialog.open) installDialog.showModal();
      return;
    }

    window.alert(
      'Android: no Chrome, toque em ⋮ e escolha Instalar app ou Adicionar à tela inicial. '
      + 'iPhone ou iPad: no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.',
    );
  };

  if (installButton) {
    if (appIsInstalled()) {
      installButton.hidden = true;
    } else {
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        installPromptEvent = event;
      });

      window.addEventListener('appinstalled', () => {
        installButton.hidden = true;
      });

      installButton.addEventListener('click', async () => {
        if (!installPromptEvent) {
          showInstallInstructions();
          return;
        }

        const promptEvent = installPromptEvent;
        installPromptEvent = null;

        try {
          await promptEvent.prompt();
          const choice = await promptEvent.userChoice;
          if (choice.outcome === 'accepted') {
            installButton.hidden = true;
          } else {
            showInstallInstructions();
          }
        } catch (error) {
          console.error('Não foi possível abrir a instalação do app:', error);
          showInstallInstructions();
        }
      });
    }
  }

  if (closeDialogButton && installDialog) {
    closeDialogButton.addEventListener('click', () => {
      installDialog.close();
    });
  }

  if ('serviceWorker' in navigator) {
    let registrationScheduled = false;
    const scheduleRegistration = () => {
      if (registrationScheduled) return;
      registrationScheduled = true;

      const registerServiceWorker = () => {
        navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
          .catch((error) => {
            console.error('Não foi possível preparar a loja para uso offline:', error);
          });
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(registerServiceWorker, { timeout: 5000 });
      } else {
        window.setTimeout(registerServiceWorker, 1000);
      }
    };

    window.addEventListener('pointerdown', scheduleRegistration, { once: true, passive: true });
    window.addEventListener('keydown', scheduleRegistration, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) scheduleRegistration();
    });
  }
})();
