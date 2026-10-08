'use client';

import Link from 'next/link';
import { Award, BookOpen, Check, Clock3, Copy, Gift, RefreshCw, Sparkles, TicketPercent } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import CustomerMissionCard from './customer-mission-card';
import { currencyFormatter, formatDate } from './customer-mission-display';

function historyDescription(entry) {
  const date = formatDate(entry.createdAt);
  return `${entry.description} · ${date}`;
}

export default function CustomerLoyaltyPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeemingId, setRedeemingId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [missionFilter, setMissionFilter] = useState('all');

  const loadSnapshot = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/loyalty', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus pontos.');
      if (!Array.isArray(data.missions) || !Array.isArray(data.rewards) || !Array.isArray(data.history)) {
        throw new Error('A resposta da fidelidade está em um formato inválido.');
      }
      setSnapshot(data);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar sua fidelidade.');
      console.error('Não foi possível carregar os pontos e missões do cliente:', loadError);
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
      if (!response.ok) throw new Error(data.error || 'Não foi possível resgatar esta recompensa.');
      setFeedback({
        error: false,
        code: data.redemption.code,
        message: `Você resgatou ${reward.name}. Seu cupom ${data.redemption.code} já está disponível.`,
      });
      await loadSnapshot(false);
    } catch (redeemError) {
      setFeedback({ error: true, message: redeemError.message || 'Não foi possível resgatar esta recompensa.' });
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

  const useCoupon = (code) => {
    window.dispatchEvent(new CustomEvent('dashboard-use-coupon', { detail: { code } }));
    setFeedback({ error: false, code, message: `Cupom ${code} carregado no carrinho. Toque em “Aplicar” para confirmar.` });
  };

  const balance = Number(snapshot?.balance) || 0;
  const missions = snapshot?.missions || [];
  const rewards = snapshot?.rewards || [];
  const history = snapshot?.history || [];
  const availableMissions = missions.filter((mission) => !mission.completedAt && !mission.soldOut);
  const completedMissions = missions.filter((mission) => Boolean(mission.completedAt));
  const missionFilterOptions = [
    { value: 'all', label: 'Todas', count: missions.length },
    { value: 'available', label: 'Em andamento', count: availableMissions.length },
    { value: 'completed', label: 'Concluídas', count: completedMissions.length },
  ];
  const filteredMissions = missionFilter === 'available'
    ? availableMissions
    : missionFilter === 'completed'
      ? completedMissions
      : missions;

  return <div className="section-shell orders-showcase customer-coupons-showcase customer-loyalty-showcase">
    <header className="section-header orders-header">
      <div>
        <span className="orders-kicker">Vantagens da sua conta</span>
        <h1>Missões e pontos</h1>
        <p>Acompanhe seus desafios, ganhe pontos ao concluir pedidos e troque-os por cupons.</p>
      </div>
      <div className="loyalty-page-header-actions">
        <Link className="loyalty-rules-back" href="/fidelidade/regras"><BookOpen size={16} aria-hidden="true" />Todas as regras</Link>
        <div className="orders-header-mark" aria-live="polite">
          <span className="orders-header-dot" />
          {loading ? 'Atualizando pontos' : `${balance.toLocaleString('pt-BR')} pontos`}
        </div>
      </div>
    </header>

    <section className="customer-coupon-summary loyalty-balance-summary" aria-label="Resumo de fidelidade">
      <div><Award size={18} aria-hidden="true" /><span>Saldo atual</span><strong>{balance.toLocaleString('pt-BR')}</strong></div>
      <div><Sparkles size={18} aria-hidden="true" /><span>Em andamento</span><strong>{availableMissions.length}</strong></div>
      <div><Gift size={18} aria-hidden="true" /><span>Recompensas</span><strong>{rewards.length}</strong></div>
      <div><Clock3 size={18} aria-hidden="true" /><span>Movimentações</span><strong>{history.length}</strong></div>
    </section>

    <nav className="loyalty-customer-nav" aria-label="Navegação de Missões e pontos">
      <a href="#loyalty-missions">Missões <span>{missions.length}</span></a>
      <a href="#loyalty-rewards">Recompensas <span>{rewards.length}</span></a>
      <a href="#loyalty-history">Histórico <span>{history.length}</span></a>
    </nav>

    {feedback && <p className={`customer-coupon-feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'} aria-live={feedback.error ? 'assertive' : 'polite'}>
      {feedback.message}
      {feedback.code && <span className="loyalty-feedback-actions">
        <button type="button" onClick={() => void copyCode(feedback.code)}><Copy size={14} aria-hidden="true" />Copiar</button>
        <button type="button" onClick={() => useCoupon(feedback.code)}><TicketPercent size={14} aria-hidden="true" />Usar no carrinho</button>
        <Link href="/dashboard/cupons">Ver meus cupons</Link>
      </span>}
    </p>}
    {error && <div className="dashboard-data-alert" role="alert">
      <span>{error}</span>
      <button type="button" onClick={refresh}>Tentar novamente</button>
    </div>}

    <section className="loyalty-section" id="loyalty-missions" aria-labelledby="loyalty-missions-heading">
      <div className="loyalty-section-heading">
        <div><span className="orders-kicker">Desafios do Hoje</span><h2 id="loyalty-missions-heading">Suas missões</h2></div>
        <button className="customer-coupon-refresh" type="button" onClick={refresh} disabled={refreshing} aria-label="Atualizar missões e pontos">
          <RefreshCw size={15} aria-hidden="true" />{refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
      {!loading && !error && missions.length > 0 && <div className="loyalty-mission-filters" role="group" aria-label="Filtrar missões">
        {missionFilterOptions.map((filter) => <button
          key={filter.value}
          type="button"
          aria-pressed={missionFilter === filter.value}
          onClick={() => setMissionFilter(filter.value)}
        >
          {filter.label}<span>{filter.count}</span>
        </button>)}
      </div>}
      {loading ? <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" />Carregando suas missões...</div>
        : error ? <div className="customer-coupon-empty" role="status"><p>As missões não puderam ser carregadas. Tente atualizar a página.</p></div>
          : missions.length ? filteredMissions.length
            ? <div className="loyalty-card-grid loyalty-mission-grid loyalty-mission-list">
              {filteredMissions.map((mission) => <CustomerMissionCard key={mission.id} mission={mission} />)}
            </div>
            : <div className="customer-coupon-empty loyalty-filter-empty" role="status">
              <p>{missionFilter === 'completed' ? 'Você ainda não concluiu uma missão.' : 'Não há missões em andamento neste momento.'}</p>
              {missionFilter !== 'all' && <button className="loyalty-empty-action" type="button" onClick={() => setMissionFilter('all')}>Ver todas as missões</button>}
            </div>
            : <div className="customer-coupon-empty" role="status"><p>Nenhuma missão ativa agora. Novos desafios aparecerão aqui.</p></div>}
    </section>

    <section className="loyalty-section" id="loyalty-rewards" aria-labelledby="loyalty-rewards-heading">
      <div className="loyalty-section-heading">
        <div><span className="orders-kicker">Troque seus pontos</span><h2 id="loyalty-rewards-heading">Recompensas</h2></div>
      </div>
      {loading ? <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" />Carregando recompensas...</div>
        : rewards.length ? <div className="loyalty-card-grid">
          {rewards.map((reward) => {
            const canRedeem = balance >= reward.pointsCost;
            return <article className="customer-coupon-card loyalty-reward-card" key={reward.id}>
              <div className="customer-coupon-card-heading"><span><Gift size={16} aria-hidden="true" />Cupom de desconto</span><strong>{reward.discountPercent}% OFF</strong></div>
              <h3>{reward.name}</h3>
              <p className="customer-coupon-card-message">{reward.description || `Cupom de ${reward.discountPercent}% de desconto.`}</p>
              <dl className="customer-coupon-dates">
                <div><dt>Custo</dt><dd>{reward.pointsCost.toLocaleString('pt-BR')} pontos</dd></div>
                <div><dt>Pedido mínimo</dt><dd>{currencyFormatter.format(Number(reward.minimumOrderAmount))}</dd></div>
                <div><dt>Validade</dt><dd>{reward.validityDays} dias após resgatar</dd></div>
              </dl>
              <button
                className="customer-coupon-use loyalty-redeem-button"
                type="button"
                onClick={() => void redeemReward(reward)}
                disabled={!canRedeem || Boolean(redeemingId)}
              >
                {redeemingId === reward.id ? 'Resgatando...' : canRedeem ? 'Resgatar pontos' : `Faltam ${(reward.pointsCost - balance).toLocaleString('pt-BR')} pontos`}
              </button>
            </article>;
          })}
        </div> : <div className="customer-coupon-empty"><p>As recompensas serão exibidas aqui quando estiverem disponíveis.</p></div>}
    </section>

    <section className="loyalty-section" id="loyalty-history" aria-labelledby="loyalty-history-heading">
      <div className="loyalty-section-heading">
        <div><span className="orders-kicker">Seu extrato</span><h2 id="loyalty-history-heading">Histórico de pontos</h2></div>
      </div>
      {loading ? <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" />Carregando histórico...</div>
        : history.length ? <div className="loyalty-history-list">
          {history.map((entry) => <article className="loyalty-history-item" key={entry.id}>
            <div><strong>{historyDescription(entry)}</strong><small>{entry.expiresAt ? `Validade: ${formatDate(entry.expiresAt)}` : 'Sem data de expiração'}</small></div>
            <span className={entry.points < 0 ? 'negative' : ''}>{entry.points > 0 ? '+' : ''}{entry.points.toLocaleString('pt-BR')} pts</span>
            {entry.couponCode && <button type="button" onClick={() => useCoupon(entry.couponCode)}>Usar {entry.couponCode}</button>}
          </article>)}
        </div> : <div className="customer-coupon-empty"><p>Suas movimentações de pontos aparecerão aqui.</p></div>}
    </section>

    <details className="customer-coupon-rules loyalty-program-rules">
      <summary>Como funciona o programa</summary>
      <ul>
        <li>Os pontos são creditados quando o pedido é concluído; pedidos cancelados não pontuam.</li>
        <li>Estornos ajustam proporcionalmente os pontos da compra e podem deixar saldo negativo, compensado por pontos futuros.</li>
        <li>Confira o prazo de cada missão: os pontos podem expirar conforme as regras do desafio.</li>
        <li>Ao resgatar, você recebe um cupom pessoal de uso único, sujeito ao pedido mínimo indicado.</li>
      </ul>
    </details>

    {feedback?.code && <span className="visually-hidden"><Check aria-hidden="true" /> Cupom disponível: {feedback.code}</span>}
  </div>;
}
