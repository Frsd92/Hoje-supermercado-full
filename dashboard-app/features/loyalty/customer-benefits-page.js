'use client';

import Link from 'next/link';
import { ArrowLeft, Clock3, Copy, RefreshCw, Sparkles, Star, TicketPercent } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { currencyFormatter, formatDate } from './customer-mission-display';
import { getCouponBenefitLabel } from '@/features/coupons/coupon-benefits';

export default function CustomerBenefitsPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemingId, setRedeemingId] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [error, setError] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  const loadSnapshot = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/loyalty', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os benefícios.');
      if (!Array.isArray(data.rewards) || !Array.isArray(data.history)) {
        throw new Error('A resposta dos benefícios está em um formato inválido.');
      }
      setSnapshot(data);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os benefícios.');
      console.error('Não foi possível carregar os benefícios do cliente:', loadError);
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot, refreshToken]);

  const refresh = () => {
    setRefreshing(true);
    setRefreshToken((token) => token + 1);
  };

  const useCoupon = (code) => {
    window.dispatchEvent(new CustomEvent('dashboard-use-coupon', { detail: { code, autoApply: true } }));
    setFeedback({ error: false, code, message: `Cupom ${code} enviado ao carrinho para esta compra.` });
  };

  const redeemReward = async (reward) => {
    setRedeemingId(reward.id);
    setFeedback(null);
    try {
      const response = await fetch('/api/loyalty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId: reward.id, requestId: window.crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível trocar esta recompensa.');
      const redemption = data.redemption;
      const benefitLabel = getCouponBenefitLabel(
        redemption.benefitType,
        redemption.discountPercent,
        redemption.discountAmount,
        redemption.maximumDiscountAmount,
      );
      const minimumOrderAmount = Number(redemption.minimumOrderAmount) || 0;
      const cooldownDays = Number(redemption.cooldownDays) || 0;
      setFeedback({
        error: false,
        code: redemption.code,
        message: `Você trocou ${reward.name} por ${benefitLabel}. Válido até ${formatDate(redemption.expiresAt)}.${minimumOrderAmount > 0 ? ` Compra mínima: ${currencyFormatter.format(minimumOrderAmount)}.` : ''}${cooldownDays > 0 ? ` Nova troca em ${cooldownDays} ${cooldownDays === 1 ? 'dia' : 'dias'}.` : ''}`,
      });
      await loadSnapshot(false);
    } catch (redeemError) {
      setFeedback({ error: true, message: redeemError.message || 'Não foi possível trocar esta recompensa.' });
    } finally {
      setRedeemingId('');
    }
  };

  const copyCode = async (code) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('A cópia automática não está disponível neste navegador.');
      await navigator.clipboard.writeText(code);
      setFeedback({ error: false, code, message: `Código ${code} copiado.` });
    } catch (copyError) {
      console.error('Não foi possível copiar o cupom resgatado:', copyError);
      setFeedback({ error: true, code, message: `Não foi possível copiar automaticamente. Selecione e copie o código ${code}.` });
    }
  };

  const balance = Number(snapshot?.balance) || 0;
  const rewards = snapshot?.rewards || [];

  return <div className="section-shell orders-showcase customer-coupons-showcase customer-benefits-showcase">
    <header className="section-header orders-header">
      <div>
        <span className="orders-kicker">Clube Hoje</span>
        <h1>Benefícios</h1>
        <p>Troque seus pontos por cupons e acompanhe quanto falta para cada recompensa.</p>
      </div>
      <div className="loyalty-page-header-actions">
        <Link className="loyalty-rules-back" href="/dashboard/fidelidade"><ArrowLeft size={16} aria-hidden="true" />Missões e pontos</Link>
        <Link className="loyalty-rules-back" href="/dashboard/cupons"><TicketPercent size={16} aria-hidden="true" />Meus cupons</Link>
      </div>
    </header>

    <section className="loyalty-benefits-balance" aria-label="Saldo de pontos">
      <span className="loyalty-club-icon" aria-hidden="true"><Star size={20} fill="currentColor" /></span>
      <div><strong>{loading ? 'Carregando saldo...' : `${balance.toLocaleString('pt-BR')} pontos`}</strong><span>Seu saldo disponível para trocar por benefícios</span></div>
      <button className="customer-coupon-refresh" type="button" onClick={refresh} disabled={refreshing} aria-label="Atualizar benefícios">
        <RefreshCw size={15} aria-hidden="true" />{refreshing ? 'Atualizando...' : 'Atualizar'}
      </button>
    </section>

    {feedback && <p className={`customer-coupon-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'} aria-live={feedback.error ? 'assertive' : 'polite'}>
      {feedback.message}
      {feedback.code && <span className="loyalty-feedback-actions">
        <button type="button" onClick={() => void copyCode(feedback.code)}><Copy size={14} aria-hidden="true" />Copiar</button>
        <button type="button" onClick={() => useCoupon(feedback.code)}><TicketPercent size={14} aria-hidden="true" />Usar</button>
        <Link href="/dashboard/cupons">Ver meus cupons</Link>
      </span>}
    </p>}

    {error && <div className="dashboard-data-alert" role="alert">
      <span>{error}</span>
      <button type="button" onClick={refresh}>Tentar novamente</button>
    </div>}

    <section className="loyalty-section" aria-labelledby="loyalty-benefits-heading">
      <div className="loyalty-section-heading">
        <div><span className="orders-kicker">Escolha sua recompensa</span><h2 id="loyalty-benefits-heading">Cupons disponíveis</h2></div>
      </div>
      {loading ? <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" />Carregando benefícios...</div>
        : rewards.length ? <div className="loyalty-benefits-grid">
          {rewards.map((reward) => {
            const pointsCost = Number(reward.pointsCost) || 0;
            const pointsNeeded = Math.max(0, pointsCost - balance);
            const canRedeem = pointsNeeded === 0;
            const canRedeemNow = canRedeem && !reward.cooldownActive;
            const progressPoints = Math.max(0, Math.min(pointsCost, balance));
            const progressPercent = pointsCost > 0 ? Math.min(100, progressPoints / pointsCost * 100) : 0;
            const benefitLabel = getCouponBenefitLabel(
              reward.benefitType,
              reward.discountPercent,
              reward.discountAmount,
              reward.maximumDiscountAmount,
            );
            const cooldownLabel = reward.cooldownActive
              ? `Nova troca disponível em ${reward.daysRemaining} ${reward.daysRemaining === 1 ? 'dia' : 'dias'}.`
              : '';
            return <article className="customer-coupon-card loyalty-benefit-card" key={reward.id}>
              <div className="loyalty-benefit-heading">
                <span className="loyalty-benefit-icon" aria-hidden="true"><TicketPercent size={18} /></span>
                <div className="loyalty-benefit-title"><span>Cupom por pontos</span><h3>{reward.name}</h3></div>
                <strong className="loyalty-benefit-value">{benefitLabel}</strong>
              </div>
              {reward.description && <p className="loyalty-benefit-description">{reward.description}</p>}
              <div className="loyalty-benefit-progress">
                <div className="loyalty-progress-label"><span>Seu progresso</span><strong>{balance.toLocaleString('pt-BR')} / {pointsCost.toLocaleString('pt-BR')}</strong></div>
                <div
                  className="loyalty-progress-track"
                  role="progressbar"
                  aria-label={`Progresso para trocar ${reward.name}`}
                  aria-valuemin="0"
                  aria-valuemax={pointsCost}
                  aria-valuenow={progressPoints}
                  aria-valuetext={canRedeem ? 'Pontos suficientes para trocar' : `Faltam ${pointsNeeded.toLocaleString('pt-BR')} pontos`}
                ><span style={{ width: `${progressPercent}%` }} /></div>
              </div>
              <dl className="customer-coupon-dates loyalty-benefit-conditions">
                <div><dt>Compra mínima</dt><dd>{Number(reward.minimumOrderAmount) > 0 ? currencyFormatter.format(Number(reward.minimumOrderAmount)) : 'Sem mínimo'}</dd></div>
                <div><dt>Validade</dt><dd>{reward.validityDays} dias após trocar</dd></div>
                {Number(reward.cooldownDays) > 0 && <div><dt>Nova troca</dt><dd>{reward.cooldownActive ? `Em ${reward.daysRemaining} ${reward.daysRemaining === 1 ? 'dia' : 'dias'}` : `${reward.cooldownDays} dias após trocar`}</dd></div>}
              </dl>
              <div className="loyalty-benefit-footer">
                <button
                  className="loyalty-redeem-button"
                  type="button"
                  onClick={() => void redeemReward(reward)}
                  disabled={!canRedeemNow || Boolean(redeemingId)}
                  aria-label={redeemingId === reward.id ? 'Trocando benefício' : `Trocar ${reward.name} por ${pointsCost.toLocaleString('pt-BR')} pontos`}
                >
                  <TicketPercent size={16} aria-hidden="true" />
                  {redeemingId === reward.id ? 'Trocando...' : 'Trocar'}
                </button>
                <div className="loyalty-benefit-cost"><Sparkles size={16} aria-hidden="true" /><strong>{pointsCost.toLocaleString('pt-BR')} pontos para trocar</strong></div>
                {cooldownLabel
                  ? <small className="loyalty-benefit-note"><Clock3 size={13} aria-hidden="true" />{cooldownLabel}</small>
                  : !canRedeem && <small className="loyalty-benefit-note">Faltam {pointsNeeded.toLocaleString('pt-BR')} pontos</small>}
              </div>
            </article>;
          })}
        </div> : <div className="customer-coupon-empty"><p>Nenhum cupom disponível agora. Volte depois ou conclua missões para acumular pontos.</p><Link className="loyalty-empty-action" href="/dashboard/fidelidade">Ver missões</Link></div>}
    </section>
  </div>;
}
