"use client";

import { ArrowLeft, ArrowRight, Check, CircleUserRound, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import Script from 'next/script';
import { signIn } from 'next-auth/react';
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
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('/dashboard');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error') || '';
    const requestedCallback = params.get('callbackUrl');
    setAuthError(error === 'google-required'
      ? 'Para acessar o painel do cliente, entre com sua conta Google.'
      : error);
    if (requestedCallback) setCallbackUrl(requestedCallback);
  }, []);

  const handleGoogleLogin = async () => {
    setIsGoogleSubmitting(true);
    setAuthError('');

    try {
      const result = await signIn('google', {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        const messages = {
          AccessDenied: 'Este e-mail não tem acesso ao dashboard.',
          Configuration: 'O login Google ainda não está configurado no servidor.',
          OAuthCallback: 'O Google não conseguiu concluir o retorno do login.',
          OAuthSignin: 'Não foi possível iniciar o login com Google.',
        };
        setAuthError(messages[result.error] || `Não foi possível entrar com Google (${result.error}).`);
        setIsGoogleSubmitting(false);
        return;
      }

      if (result?.url) window.location.assign(result.url);
    } catch {
      setAuthError('Não foi possível conectar ao login do Google. Tente novamente.');
      setIsGoogleSubmitting(false);
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

          <button className="primary-action google-signin" onClick={handleGoogleLogin} disabled={isGoogleSubmitting}>
            <span className="google-mark">G</span>
            {isGoogleSubmitting ? 'Conectando...' : 'Entrar com Google'}
          </button>

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
