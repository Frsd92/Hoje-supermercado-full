'use client';

import Link from 'next/link';
import { Check, Clock3, Copy, RefreshCw, ShoppingBag, TicketPercent } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const filters = [
  { value: 'available', label: 'Disponíveis' },
  { value: 'processing', label: 'Em processamento' },
  { value: 'redeemed', label: 'Resgatados' },
  { value: 'expired', label: 'Expirados' },
  { value: 'all', label: 'Todos' },
];

const statusLabels = {
  available: 'Disponível',
  processing: 'Em processamento',
  redeemed: 'Resgatado',
  expired: 'Expirado',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(date);
}

export default function CustomerCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [activeFilter, setActiveFilter] = useState('available');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;
    const loadCoupons = async (showLoading = true) => {
      if (showLoading) setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/coupons?history=1', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus cupons.');
        if (!Array.isArray(data.coupons)) throw new Error('A resposta de cupons está em um formato inválido.');
        if (active) setCoupons(data.coupons);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || 'Não foi possível carregar seus cupons.');
          console.error('Não foi possível carregar os cupons do cliente:', loadError);
        }
      } finally {
        if (active && showLoading) setLoading(false);
      }
    };

    void loadCoupons();
    const handleCouponUpdate = () => { void loadCoupons(false); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadCoupons(false);
    };
    window.addEventListener('dashboard-coupons-updated', handleCouponUpdate);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('dashboard-coupons-updated', handleCouponUpdate);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshToken]);

  const filteredCoupons = useMemo(() => coupons
    .filter((coupon) => activeFilter === 'all' || coupon.status === activeFilter)
    .sort((first, second) => {
      if (activeFilter === 'available') return new Date(first.expiresAt) - new Date(second.expiresAt);
      return new Date(second.createdAt) - new Date(first.createdAt);
    }), [activeFilter, coupons]);

  const couponCounts = useMemo(() => coupons.reduce((counts, coupon) => ({
    ...counts,
    [coupon.status]: (counts[coupon.status] || 0) + 1,
  }), { available: 0, processing: 0, redeemed: 0, expired: 0 }), [coupons]);

  const copyCoupon = async (code) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('A cópia automática não está disponível neste navegador.');
      await navigator.clipboard.writeText(code);
      setFeedback({ code, error: false, message: `Código ${code} copiado. Use-o no carrinho para validar o desconto.` });
    } catch (copyError) {
      console.error('Não foi possível copiar o cupom:', copyError);
      setFeedback({ code, error: true, message: `Não foi possível copiar automaticamente. Você ainda pode selecionar o código ${code} e copiá-lo.` });
    }
  };

  const useCoupon = (coupon) => {
    window.dispatchEvent(new CustomEvent('dashboard-use-coupon', { detail: { code: coupon.code } }));
    setFeedback({
      code: coupon.code,
      error: false,
      message: `Cupom ${coupon.code} carregado no carrinho. Toque em “Aplicar” para confirmar o desconto.`,
    });
  };

  return <div className="section-shell orders-showcase customer-coupons-showcase">
    <header className="section-header orders-header">
      <div>
        <span className="orders-kicker">Vantagens da sua conta</span>
        <h1>Meus cupons</h1>
        <p>Confira os descontos enviados para você, a validade e o histórico de uso.</p>
      </div>
      <div className="orders-header-mark" aria-live="polite">
        <span className="orders-header-dot" />
        {loading ? 'Atualizando cupons' : `${couponCounts.available} disponível(is)`}
      </div>
    </header>

    <section className="customer-coupon-summary" aria-label="Resumo dos seus cupons">
      <div><TicketPercent size={18} aria-hidden="true" /><span>Disponíveis</span><strong>{couponCounts.available}</strong></div>
      <div><Clock3 size={18} aria-hidden="true" /><span>Em processamento</span><strong>{couponCounts.processing}</strong></div>
      <div><Check size={18} aria-hidden="true" /><span>Já resgatados</span><strong>{couponCounts.redeemed}</strong></div>
      <div><Clock3 size={18} aria-hidden="true" /><span>Expirados</span><strong>{couponCounts.expired}</strong></div>
    </section>

    <div className="customer-coupon-rules">
      <strong>Como seus cupons funcionam</strong>
      <ul>
        <li>São pessoais e ficam vinculados a esta conta.</li>
        <li>Cada cupom pode ser usado uma vez, até a data de validade indicada.</li>
        <li>O desconto percentual pode ser combinado com promoções de produtos; só é permitido um cupom por pedido.</li>
        <li>A validade e a elegibilidade são confirmadas novamente ao aplicar e finalizar a compra.</li>
      </ul>
    </div>

    {feedback && <p className={`customer-coupon-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'} aria-live={feedback.error ? 'assertive' : 'polite'}>
      {feedback.message}
    </p>}
    {error && <div className="dashboard-data-alert" role="alert">
      <span>{error}</span>
      <button type="button" onClick={() => setRefreshToken((token) => token + 1)}>Tentar novamente</button>
    </div>}

    <div className="tab-row customer-coupon-tabs" role="group" aria-label="Filtrar seus cupons">
      {filters.map((filter) => <button
        key={filter.value}
        type="button"
        aria-pressed={activeFilter === filter.value}
        className={activeFilter === filter.value ? 'active' : ''}
        onClick={() => setActiveFilter(filter.value)}
      >{filter.label} ({filter.value === 'all' ? coupons.length : couponCounts[filter.value]})</button>)}
      <button className="customer-coupon-refresh" type="button" onClick={() => setRefreshToken((token) => token + 1)} disabled={loading} aria-label="Atualizar cupons">
        <RefreshCw size={15} aria-hidden="true" />Atualizar
      </button>
    </div>

    <div id="customer-coupon-list">
      {loading ? <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" />Carregando seus cupons...</div>
        : error ? null
          : filteredCoupons.length ? <div className="customer-coupon-grid">
          {filteredCoupons.map((coupon) => <article className={`customer-coupon-card status-${coupon.status}`} key={coupon.code}>
            <div className="customer-coupon-card-heading">
              <span className={`customer-coupon-status status-${coupon.status}`}>{statusLabels[coupon.status] || 'Situação não identificada'}</span>
              <span>{coupon.discountPercent}% de desconto</span>
            </div>
            <p className="customer-coupon-card-message">{coupon.message || 'Um desconto especial foi separado para você.'}</p>
            <div className="customer-coupon-code">
              <span>Código do cupom</span>
              <strong>{coupon.code}</strong>
            </div>
            <dl className="customer-coupon-dates">
              <div><dt>Válido até</dt><dd>{formatDate(coupon.expiresAt)}</dd></div>
              {coupon.status === 'redeemed' && coupon.redeemedAt && <div><dt>Resgatado em</dt><dd>{formatDate(coupon.redeemedAt)}</dd></div>}
              {coupon.status === 'processing' && coupon.redeemedAt && <div><dt>Pedido iniciado em</dt><dd>{formatDate(coupon.redeemedAt)}</dd></div>}
              {coupon.status === 'expired' && <div><dt>Situação</dt><dd>Prazo encerrado</dd></div>}
            </dl>
            {coupon.status === 'available' ? <div className="customer-coupon-actions">
              <button type="button" className="customer-coupon-use" onClick={() => useCoupon(coupon)}><ShoppingBag size={16} aria-hidden="true" />Usar no carrinho</button>
              <button type="button" className="customer-coupon-copy" onClick={() => copyCoupon(coupon.code)} aria-label={`Copiar código ${coupon.code}`}><Copy size={16} aria-hidden="true" />Copiar código</button>
            </div> : <p className="customer-coupon-closed">{coupon.status === 'processing'
              ? 'Seu pagamento está sendo confirmado. O cupom será liberado se a compra não for concluída.'
              : coupon.status === 'redeemed'
                ? 'Este cupom já foi utilizado.'
                : 'Este cupom não pode mais ser aplicado.'}</p>}
            {feedback?.code === coupon.code && <p className={`customer-coupon-card-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
          </article>)}
        </div> : (
          <div className="empty-state customer-coupon-empty">
            <div className="empty-state-box"><TicketPercent size={34} aria-hidden="true" /></div>
            <h3>{activeFilter === 'available'
              ? 'Nenhum cupom disponível agora'
              : activeFilter === 'all'
                ? 'Você ainda não recebeu cupons'
                : activeFilter === 'processing'
                  ? 'Nenhum pagamento em processamento'
                  : `Nenhum cupom ${activeFilter === 'redeemed' ? 'resgatado' : 'expirado'}`}</h3>
            <p>{activeFilter === 'available' ? 'Quando a loja enviar uma oferta para sua conta, ela aparecerá aqui.' : 'Seus cupons e o histórico de uso ficam organizados nesta área.'}</p>
            <Link href="/" className="secondary-cta"><ShoppingBag size={16} aria-hidden="true" />Voltar à loja</Link>
          </div>
        )}
    </div>
  </div>;
}
