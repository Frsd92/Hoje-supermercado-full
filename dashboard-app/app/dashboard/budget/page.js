'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CircleDollarSign, Gauge, Save, TrendingDown, TrendingUp } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { formatCurrency, getBudgetProgress, getCurrentMonthSpend } from '../budget';
import { readLocalBudget, saveLocalBudget } from '../budget-storage';
import AccountPageNav from '../account-page-nav';

export default function BudgetPage() {
  const { data: session, status } = useSession();
  const [monthlyBudget, setMonthlyBudget] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [refundSyncWarning, setRefundSyncWarning] = useState(false);
  const [today, setToday] = useState(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const loadBudget = async () => {
      try {
        const syncResponse = await fetch('/api/my/orders/refunds/reconcile', { method: 'POST', cache: 'no-store' });
        const syncData = await syncResponse.json();
        if (!syncResponse.ok) throw new Error(syncData.error || 'Não foi possível atualizar os estornos.');
        if (active) setRefundSyncWarning(syncData.warning === true);
      } catch (error) {
        console.error('Não foi possível atualizar os estornos antes de calcular o orçamento:', error);
        if (active) setRefundSyncWarning(true);
      }
      const [profileResponse, ordersResponse] = await Promise.all([
        fetch('/api/profile', { cache: 'no-store' }),
        fetch('/api/my/orders', { cache: 'no-store' }),
      ]);
      if (!ordersResponse.ok) throw new Error('Não foi possível carregar os gastos deste mês.');
      const profileData = profileResponse.ok ? await profileResponse.json() : null;
      const ordersData = await ordersResponse.json();
      if (!active) return;
      const localBudget = readLocalBudget(session?.user?.email);
      const savedBudget = Number(profileData?.profile?.monthlyBudget) || 0;
      setMonthlyBudget(localBudget ?? profileData?.profile?.monthlyBudget ?? '');
      setOrders(ordersData.orders || []);

      if (localBudget > 0 && localBudget !== savedBudget) {
        setFeedback('Sincronizando com sua conta o orçamento salvo neste dispositivo...');
        try {
          const syncResponse = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monthlyBudget: localBudget }),
          });
          const syncData = await syncResponse.json();
          if (!syncResponse.ok) throw new Error(syncData.error || 'Sincronização indisponível.');
          if (active) setFeedback('Orçamento deste dispositivo sincronizado com sua conta.');
        } catch (error) {
          if (active) setFeedback(`Orçamento mantido neste dispositivo. Não foi possível sincronizar com a conta: ${error.message}`);
        }
      } else if (!profileData && localBudget === null) {
        setFeedback('A conexão com o servidor está indisponível. O orçamento poderá ser salvo neste dispositivo.');
      }
    };
    loadBudget()
      .catch((error) => {
        if (active) setFeedback(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [status, session?.user?.email]);

  const monthSpend = getCurrentMonthSpend(orders, today || new Date());
  const budgetAmount = Number(monthlyBudget) || 0;
  const progress = getBudgetProgress(monthSpend, budgetAmount);
  const daysInMonth = today ? new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() : 0;
  const daysElapsed = today?.getDate() || 0;
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  const expectedSpendToDate = daysInMonth > 0 ? (budgetAmount * daysElapsed) / daysInMonth : 0;
  const isOverBudget = budgetAmount > 0 && monthSpend > budgetAmount;
  const isAbovePace = budgetAmount > 0 && monthSpend > expectedSpendToDate;
  const remainingBudget = Math.max(0, budgetAmount - monthSpend);
  const suggestedDailyLimit = daysRemaining > 0 ? remainingBudget / daysRemaining : remainingBudget;
  const paceLabel = !budgetAmount
    ? 'Comece pelo seu limite mensal'
    : isOverBudget
      ? 'Limite mensal ultrapassado'
      : isAbovePace
        ? 'Ritmo acima do planejado'
        : 'Você está no ritmo do plano';
  const PaceIcon = isAbovePace ? TrendingUp : TrendingDown;

  const saveBudget = async (event) => {
    event.preventDefault();
    if (!budgetAmount) {
      setFeedback('Informe um valor mensal maior que zero.');
      return;
    }
    setSaving(true);
    setFeedback('');
    try {
      saveLocalBudget(session?.user?.email, budgetAmount);
      setMonthlyBudget(budgetAmount);
      try {
        const response = await fetch('/api/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monthlyBudget: budgetAmount }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sincronização indisponível.');
        saveLocalBudget(session?.user?.email, data.profile.monthlyBudget);
        setMonthlyBudget(data.profile.monthlyBudget);
        setFeedback('Orçamento salvo e sincronizado com sua conta.');
      } catch (error) {
        setFeedback(`Orçamento salvo neste dispositivo. Não foi possível sincronizar com a conta: ${error.message}`);
      }
    } catch (error) {
      setFeedback(`Não foi possível salvar o orçamento neste dispositivo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="section-shell budget-page">
      <AccountPageNav current="budget" />
      <div className="section-header">
        <div>
          <span className="dashboard-page-eyebrow">Meu planejamento</span>
          <h1>Meu Orçamento</h1>
          <p>Defina quanto deseja gastar e acompanhe suas compras neste mês.</p>
        </div>
      </div>
      {refundSyncWarning && <p className="profile-feedback error" role="status">Não foi possível confirmar alguns estornos com a Pagar.me. O gasto mensal pode estar temporariamente desatualizado.</p>}

      <div className="budget-page-grid">
        <section className="budget-overview-card">
          <div className="budget-overview-heading">
            <span className="budget-overview-icon"><CircleDollarSign size={22} aria-hidden="true" /></span>
            <div>
              <span className="budget-overview-kicker">Seu mês em números</span>
              <span className="budget-overview-label">Gasto acumulado</span>
            </div>
            <span className={`budget-pace-badge${isOverBudget ? ' over-budget' : isAbovePace ? ' above-pace' : ''}`}>
              {budgetAmount ? <PaceIcon size={15} aria-hidden="true" /> : <Gauge size={15} aria-hidden="true" />}
              {paceLabel}
            </span>
          </div>
          <div className="budget-overview-values">
            <div className="budget-overview-spent">
              <strong>{formatCurrency(monthSpend)}</strong>
              <span>gasto neste mês</span>
            </div>
            <div className="budget-overview-limit">
              <span>Limite definido</span>
              <strong>{budgetAmount ? formatCurrency(budgetAmount) : 'Ainda não definido'}</strong>
            </div>
          </div>
          {budgetAmount > 0 && daysInMonth > 0 && (
            <div className="budget-overview-progress">
              <div
                className="budget-meter budget-page-meter"
                role="progressbar"
                aria-label="Uso do orçamento mensal"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={Math.round(progress)}
                aria-valuetext={`${Math.round(progress)}% do limite utilizado. O ritmo proporcional do mês seria ${formatCurrency(expectedSpendToDate)}.`}
                style={{ '--budget-pace-marker': `${Math.min(100, (daysElapsed / daysInMonth) * 100)}%` }}
              >
                <span className={progress >= 80 ? 'near-limit' : ''} style={{ width: `${progress}%` }} />
              </div>
              <div className="budget-overview-progress-labels"><span>Ritmo ideal até hoje</span><span>Limite mensal</span></div>
            </div>
          )}
          {budgetAmount > 0 ? (
            <div className={`budget-pace-insight${isOverBudget ? ' over-budget' : isAbovePace ? ' above-pace' : ''}`}>
              <CalendarDays size={18} aria-hidden="true" />
              <div>
                <strong>{isOverBudget
                  ? `Você passou ${formatCurrency(monthSpend - budgetAmount)} do limite.`
                  : daysRemaining > 0
                    ? `Restam ${formatCurrency(remainingBudget)} para ${daysRemaining} ${daysRemaining === 1 ? 'dia' : 'dias'}.`
                    : `Saldo no fechamento: ${formatCurrency(remainingBudget)}.`}</strong>
                <span>{daysRemaining > 0
                  ? `Para fechar dentro do limite, use em média até ${formatCurrency(suggestedDailyLimit)} por dia.`
                  : isOverBudget
                    ? 'Ajuste seu próximo planejamento para começar o novo mês com clareza.'
                    : 'Seu orçamento mensal está encerrando dentro do limite.'}</span>
              </div>
            </div>
          ) : (
            <div className="budget-pace-insight">
              <Gauge size={18} aria-hidden="true" />
              <div>
                <strong>Defina um limite para acompanhar seu ritmo</strong>
                <span>Seu gasto acumulado aparecerá aqui assim que você configurar um orçamento mensal.</span>
              </div>
            </div>
          )}
          {budgetAmount > 0 && today && <span className="budget-reference-note">
            Referência proporcional até hoje: {formatCurrency(expectedSpendToDate)} de {formatCurrency(budgetAmount)}.
          </span>}
        </section>

        <form className="budget-form-card" onSubmit={saveBudget}>
          <span className="budget-form-step">Seu limite pessoal</span>
          <h2>Limite mensal</h2>
          <p>Este valor é pessoal e pode ser alterado sempre que você quiser.</p>
          <label className="form-field" htmlFor="monthly-budget">
            <span>Quanto deseja gastar por mês?</span>
            <div className="budget-input-wrap"><span aria-hidden="true">R$</span><input id="monthly-budget" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" value={monthlyBudget} onChange={(event) => setMonthlyBudget(event.target.value)} disabled={loading} placeholder="Ex.: 1500,00" required /></div>
          </label>
          <button className="primary-cta" type="submit" disabled={loading || saving}>
            <Save size={16} /> {saving ? 'Salvando...' : 'Salvar orçamento'}
          </button>
          {feedback && <p className={`profile-feedback ${feedback.startsWith('Não') || feedback.startsWith('Informe') ? 'error' : ''}`} role={feedback.startsWith('Não') || feedback.startsWith('Informe') ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
        </form>
      </div>
    </div>
  );
}
