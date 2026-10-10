'use client';

import { useEffect, useState } from 'react';
import { CircleDollarSign, Save } from 'lucide-react';
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

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const loadBudget = async () => {
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

  const monthSpend = getCurrentMonthSpend(orders);
  const budgetAmount = Number(monthlyBudget) || 0;
  const progress = getBudgetProgress(monthSpend, budgetAmount);

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

      <div className="budget-page-grid">
        <section className="budget-overview-card">
          <span className="budget-overview-icon"><CircleDollarSign size={22} /></span>
          <span className="budget-overview-label">Gasto neste mês</span>
          <strong>{formatCurrency(monthSpend)}</strong>
          <span className="budget-overview-caption">{budgetAmount ? `de ${formatCurrency(budgetAmount)} definidos` : 'Defina um limite mensal para acompanhar seu progresso.'}</span>
          {budgetAmount > 0 && (
            <div className="budget-meter budget-page-meter" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress)} aria-valuetext={`${Math.round(progress)}% do orçamento utilizado`}>
              <span className={progress >= 80 ? 'near-limit' : ''} style={{ width: `${progress}%` }} />
            </div>
          )}
          {budgetAmount > 0 && <span className={`budget-remaining ${monthSpend > budgetAmount ? 'over-budget' : ''}`}>{monthSpend > budgetAmount ? `Você ultrapassou o limite em ${formatCurrency(monthSpend - budgetAmount)}.` : monthSpend === budgetAmount ? 'Você atingiu o limite mensal.' : `Restam ${formatCurrency(budgetAmount - monthSpend)} do seu orçamento.`}</span>}
          {!budgetAmount && <p className="budget-first-use">Seu limite mensal ajuda a acompanhar o ritmo das compras. Você pode alterá-lo quando quiser.</p>}
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
