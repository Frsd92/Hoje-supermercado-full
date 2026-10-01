'use client';

import { signIn } from 'next-auth/react';
import { useEffect, useState } from 'react';

function getCallbackUrl(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/erp';

  const url = new URL(value, window.location.origin);
  if (url.origin !== window.location.origin || (url.pathname !== '/erp' && !url.pathname.startsWith('/erp/'))) return '/erp';
  return `${url.pathname}${url.search}${url.hash}`;
}

export default function ERPLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'erp-forbidden') {
      setError('Esta sessão não tem acesso ao ERP. Entre com as credenciais exclusivas do CEO.');
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        username,
        password,
        callbackUrl: getCallbackUrl(new URLSearchParams(window.location.search).get('callbackUrl')),
        redirect: false,
      });

      if (result?.error || !result?.url) {
        setError('Nome de usuário ou senha inválidos.');
        setSubmitting(false);
        return;
      }

      window.location.assign(result.url);
    } catch {
      setError('Não foi possível validar o acesso agora. Tente novamente.');
      setSubmitting(false);
    }
  }

  return (
    <main className="erp-login-page">
      <section className="erp-login-card" aria-labelledby="erp-login-title">
        <a className="erp-login-back" href="/">Hoje Supermercado</a>
        <div className="erp-login-mark" aria-hidden="true">H</div>
        <p className="erp-login-eyebrow">Acesso restrito</p>
        <h1 id="erp-login-title">ERP Executivo</h1>
        <p className="erp-login-description">Entre com as credenciais privadas do CEO para continuar.</p>

        <form className="erp-login-form" onSubmit={handleSubmit}>
          <label htmlFor="erp-username">Nome de usuário</label>
          <input
            id="erp-username"
            type="text"
            name="username"
            autoComplete="username"
            maxLength={32}
            pattern="[A-Za-z0-9._-]{3,32}"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="erp-password">Senha</label>
          <input
            id="erp-password"
            type="password"
            name="password"
            autoComplete="current-password"
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error && <p className="erp-login-error" role="alert">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Validando...' : 'Entrar no ERP'}
          </button>
        </form>

        <p className="erp-login-security">Acesso protegido. As senhas não são armazenadas em texto puro.</p>
      </section>
    </main>
  );
}
