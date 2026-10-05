"use client";

import { Apple, ArrowLeft, Check, CircleUserRound, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import Script from 'next/script';
import { getProviders, signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const featureList = [
  { icon: Truck, label: 'Entrega rápida' },
  { icon: ShieldCheck, label: 'Compra segura' },
  { icon: Sparkles, label: 'Ofertas todos os dias' },
  { icon: Star, label: 'As melhores marcas' },
];

export default function LoginPage() {
  const router = useRouter();
  const [authError, setAuthError] = useState('');
  const [availableProviders, setAvailableProviders] = useState({});
  const [submittingProvider, setSubmittingProvider] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('/dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error') || '';
    const requestedCallback = params.get('callbackUrl');
    setAuthError(error === 'google-required'
      ? 'Para acessar o painel do cliente, entre com sua conta Google ou Apple.'
      : error);
    if (requestedCallback) setCallbackUrl(requestedCallback);
  }, []);

  useEffect(() => {
    let isMounted = true;

    getProviders()
      .then((providers) => {
        if (isMounted) {
          setAvailableProviders({
            google: Boolean(providers?.google),
            apple: Boolean(providers?.apple),
          });
        }
      })
      .catch((error) => {
        console.error('Não foi possível carregar os provedores de login:', error);
        if (isMounted) setAuthError('Não foi possível carregar as opções de login. Tente novamente.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSocialLogin = async (provider) => {
    const providerName = provider === 'apple' ? 'Apple' : 'Google';
    setSubmittingProvider(provider);
    setAuthError('');

    try {
      const result = await signIn(provider, {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        const messages = {
          AccessDenied: 'Esta conta não tem acesso ao painel do cliente.',
          Configuration: `O login com ${providerName} ainda não está configurado no servidor.`,
          OAuthCallback: `${providerName} não conseguiu concluir o retorno do login.`,
          OAuthSignin: `Não foi possível iniciar o login com ${providerName}.`,
        };
        setAuthError(messages[result.error] || `Não foi possível entrar com ${providerName} (${result.error}).`);
        setSubmittingProvider('');
        return;
      }

      if (result?.url) window.location.assign(result.url);
      else setSubmittingProvider('');
    } catch {
      setAuthError(`Não foi possível conectar ao login com ${providerName}. Tente novamente.`);
      setSubmittingProvider('');
    }
  };

  return (
    <>
    <Script src="/analytics-consent.js" strategy="afterInteractive" />
    <main className="login-page">
      <section className="login-visual">
        <div className="visual-sheen" />
        <div className="visual-brand">Hoje</div>
        <div className="visual-badge">Seja bem-vindo!</div>

        <div className="visual-copy">
          <h1>Todo o que você precisa, em um só lugar!</h1>
          <p>
            Alimentos, bebidas, limpeza, higiene, açúcar, hortifruti, pet e muito mais.
            Qualidade, praticidade e os melhores preços para você.
          </p>
        </div>

        <div className="feature-stack">
          {featureList.map(({ icon: Icon, label }) => (
            <div key={label} className="visual-feature-item">
              <span className="visual-feature-icon">
                <Icon size={18} />
              </span>
              <div>
                <strong>{label}</strong>
                <small>{label === 'Entrega rápida' ? 'Receba no seu endereço' : label === 'Compra segura' ? 'Seus dados protegidos' : label === 'Ofertas todos os dias' ? 'Economize de verdade' : 'Tudo o que você confia'}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="visual-footer-box">
          <div className="mini-avatar">
            <CircleUserRound size={18} />
          </div>
          <div>
            <strong>Sua compra, do seu jeito.</strong>
            <span>Online, rápido e seguro.</span>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <div className="login-header-row">
            <a className="login-store-link" href="/">
              <ArrowLeft size={15} />
              <span>Voltar para a loja</span>
            </a>
          </div>

          <div className="login-brand-wrap">
            <img src="/logo-hoje.webp" alt="Hoje Supermercado" />
          </div>

          <h1>Entrar no Hoje</h1>
          <p className="login-subtitle">Continue com sua conta para acessar o painel do cliente.</p>

          <button className="primary-action google-signin" onClick={() => handleSocialLogin('google')} disabled={Boolean(submittingProvider)}>
            <span className="google-mark">G</span>
            {submittingProvider === 'google' ? 'Conectando...' : 'Entrar com Google'}
          </button>

          {availableProviders.apple && (
            <button className="primary-action apple-signin" onClick={() => handleSocialLogin('apple')} disabled={Boolean(submittingProvider)}>
              <Apple size={20} aria-hidden="true" />
              {submittingProvider === 'apple' ? 'Conectando...' : 'Entrar com Apple'}
            </button>
          )}

          {authError && (
            <p className="login-error">
              {authError}
            </p>
          )}

          <div className="security-box">
            <div className="security-mark">
              <Check size={16} />
            </div>
            <div>
              <strong>Seus dados estão protegidos</strong>
              <span>Utilizamos tecnologia de ponta para garantir a sua segurança.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
    </>
  );
}
