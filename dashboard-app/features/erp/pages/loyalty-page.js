'use client';

import Link from 'next/link';
import { Award, BookOpen, CheckCheck, Gift, Pencil, RefreshCw, Save, Target, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  loyaltyMissionRuleOptions,
  loyaltyPointExpiryOptions,
} from '@/features/loyalty/mission-rules.js';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function localDateTimeValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function initialMissionForm() {
  return {
    name: '',
    description: '',
    ruleType: 'MINIMUM_SPEND',
    targetAmount: '100',
    targetCount: '1',
    category: '',
    pointsReward: '100',
    rewardLimit: '',
    recurrence: 'weekly',
    startsAt: localDateTimeValue(new Date()),
    endsAt: '',
    pointsExpiryPolicy: 'CYCLE_END',
    pointsExpiryDays: '30',
    pointsExpireAt: '',
    status: 'draft',
  };
}

const initialRewardForm = {
  name: '',
  description: '',
  pointsCost: '100',
  discountPercent: '10',
  minimumOrderAmount: '0',
  validityDays: '30',
  active: true,
};

const missionStatusLabels = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
};

function statusClass(value) {
  return `loyalty-status loyalty-status-${value}`;
}

async function requestData(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

export default function LoyaltyPage() {
  const [snapshot, setSnapshot] = useState({ missions: [], rewards: [], categories: [] });
  const [missionForm, setMissionForm] = useState(initialMissionForm);
  const [rewardForm, setRewardForm] = useState(initialRewardForm);
  const [editingMissionId, setEditingMissionId] = useState('');
  const [editingRewardId, setEditingRewardId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingMission, setSavingMission] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  const loadSnapshot = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await requestData('/api/erp/loyalty');
      if (!Array.isArray(data.missions) || !Array.isArray(data.rewards) || !Array.isArray(data.categories)) {
        throw new Error('A resposta do programa de fidelidade está em um formato inválido.');
      }
      setSnapshot(data);
      setFeedbackError(false);
      return '';
    } catch (error) {
      console.error('Não foi possível carregar as missões e recompensas do ERP:', error);
      setFeedback(error.message || 'Não foi possível carregar o programa de fidelidade.');
      setFeedbackError(true);
      return error.message;
    } finally {
      if (showLoading) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  const refresh = async () => {
    setRefreshing(true);
    const error = await loadSnapshot(false);
    if (!error) {
      setFeedback('Indicadores do programa de fidelidade atualizados.');
      setFeedbackError(false);
    }
  };

  const cancelMissionEdit = () => {
    setEditingMissionId('');
    setMissionForm(initialMissionForm());
  };

  const cancelRewardEdit = () => {
    setEditingRewardId('');
    setRewardForm(initialRewardForm);
  };

  const startMissionEdit = (mission) => {
    setEditingMissionId(mission.id);
    setMissionForm({
      name: mission.name,
      description: mission.description || '',
      ruleType: mission.ruleType,
      targetAmount: String(Number(mission.targetAmount) || 0),
      targetCount: String(mission.targetCount),
      category: mission.category || '',
      pointsReward: String(mission.pointsReward),
      rewardLimit: mission.rewardLimit === null ? '' : String(mission.rewardLimit),
      recurrence: mission.recurrence,
      startsAt: localDateTimeValue(mission.startsAt),
      endsAt: localDateTimeValue(mission.endsAt),
      pointsExpiryPolicy: mission.pointsExpiryPolicy,
      pointsExpiryDays: mission.pointsExpiryDays ? String(mission.pointsExpiryDays) : '30',
      pointsExpireAt: localDateTimeValue(mission.pointsExpireAt),
      status: mission.status,
    });
  };

  const startRewardEdit = (reward) => {
    setEditingRewardId(reward.id);
    setRewardForm({
      name: reward.name,
      description: reward.description || '',
      pointsCost: String(reward.pointsCost),
      discountPercent: String(reward.discountPercent),
      minimumOrderAmount: String(Number(reward.minimumOrderAmount) || 0),
      validityDays: String(reward.validityDays),
      active: reward.active,
    });
  };

  const updateMissionField = (field, value) => {
    setMissionForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'ruleType' && value === 'FIRST_PURCHASE') {
        next.targetCount = '1';
        next.recurrence = 'none';
      }
      return next;
    });
  };

  const submitMission = async (event) => {
    event.preventDefault();
    setSavingMission(true);
    setFeedback('');
    const payload = {
      ...missionForm,
      type: 'mission',
      startsAt: new Date(missionForm.startsAt).toISOString(),
      endsAt: missionForm.endsAt ? new Date(missionForm.endsAt).toISOString() : null,
      pointsExpireAt: missionForm.pointsExpireAt ? new Date(missionForm.pointsExpireAt).toISOString() : null,
    };
    try {
      await requestData('/api/erp/loyalty', {
        method: editingMissionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingMissionId ? { ...payload, id: editingMissionId } : payload),
      });
      setFeedback(editingMissionId ? 'Missão atualizada.' : 'Missão criada.');
      setFeedbackError(false);
      cancelMissionEdit();
      await loadSnapshot(false);
    } catch (error) {
      setFeedback(error.message || 'Não foi possível salvar a missão.');
      setFeedbackError(true);
    } finally {
      setSavingMission(false);
    }
  };

  const submitReward = async (event) => {
    event.preventDefault();
    setSavingReward(true);
    setFeedback('');
    const payload = { ...rewardForm, type: 'reward' };
    try {
      await requestData('/api/erp/loyalty', {
        method: editingRewardId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingRewardId ? { ...payload, id: editingRewardId } : payload),
      });
      setFeedback(editingRewardId ? 'Recompensa atualizada.' : 'Recompensa criada.');
      setFeedbackError(false);
      cancelRewardEdit();
      await loadSnapshot(false);
    } catch (error) {
      setFeedback(error.message || 'Não foi possível salvar a recompensa.');
      setFeedbackError(true);
    } finally {
      setSavingReward(false);
    }
  };

  const missions = snapshot.missions || [];
  const rewards = snapshot.rewards || [];
  const totalParticipants = missions.reduce((sum, mission) => sum + mission.participants, 0);
  const totalCompletions = missions.reduce((sum, mission) => sum + mission.completions, 0);
  const totalPointsAwarded = missions.reduce((sum, mission) => sum + mission.pointsAwarded, 0);

  return <div className="erp-module-page loyalty-erp-page">
    <header className="erp-customer-header">
      <div><span className="eyebrow">Relacionamento com clientes</span><h1>Missões e fidelidade</h1><p>Configure desafios, recompensas em cupons e acompanhe os resultados.</p></div>
      <div className="loyalty-erp-header-actions">
        <Link className="editor-ghost" href="/fidelidade/regras"><BookOpen size={15} aria-hidden="true" />Regras do programa</Link>
        <button className="editor-ghost" type="button" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={15} aria-hidden="true" />{refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>
    </header>
    <div className="coupon-delivery-note"><Award size={18} aria-hidden="true" /><span>Os pontos são concedidos apenas na conclusão do pedido. Estornos parciais ajustam os créditos proporcionalmente; se o cliente já resgatou os pontos, o saldo negativo é compensado pelos ganhos futuros.</span></div>

    <section className="erp-customer-metrics loyalty-admin-metrics" aria-label="Resultados do programa">
      <div className="erp-customer-metric"><Users size={18} aria-hidden="true" /><strong>{totalParticipants}</strong><span>Participações</span></div>
      <div className="erp-customer-metric"><CheckCheck size={18} aria-hidden="true" /><strong>{totalCompletions}</strong><span>Missões concluídas</span></div>
      <div className="erp-customer-metric"><Award size={18} aria-hidden="true" /><strong>{totalPointsAwarded.toLocaleString('pt-BR')}</strong><span>Pontos concedidos</span></div>
    </section>

    {feedback && <p className={`notification-feedback ${feedbackError ? 'error' : 'success'}`} role={feedbackError ? 'alert' : 'status'} aria-live={feedbackError ? 'assertive' : 'polite'}>{feedback}</p>}
    {loading ? <div className="erp-empty-data">Carregando o programa de fidelidade...</div> : <>
      <div className="loyalty-admin-grid">
        <form className="notification-composer loyalty-admin-form" onSubmit={submitMission}>
          <div className="notification-composer-heading"><span className="notification-composer-icon"><Target size={19} aria-hidden="true" /></span><div><h2>{editingMissionId ? 'Editar missão' : 'Criar missão'}</h2><p>Defina a regra, o ciclo, os pontos e o limite de participantes.</p></div></div>
          <label>Nome da missão<input value={missionForm.name} onChange={(event) => updateMissionField('name', event.target.value)} minLength="3" maxLength="80" required /></label>
          <label>Descrição<textarea value={missionForm.description} onChange={(event) => updateMissionField('description', event.target.value)} maxLength="500" rows="2" /></label>
          <div className="loyalty-form-grid">
            <label>Tipo de missão<select value={missionForm.ruleType} onChange={(event) => updateMissionField('ruleType', event.target.value)}>{loyaltyMissionRuleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {missionForm.ruleType === 'CATEGORY_SPEND' && <label>Categoria<input list="loyalty-category-options" value={missionForm.category} onChange={(event) => updateMissionField('category', event.target.value)} maxLength="80" required /><datalist id="loyalty-category-options">{snapshot.categories.map((category) => <option key={category} value={category} />)}</datalist></label>}
            {['MINIMUM_SPEND', 'CATEGORY_SPEND'].includes(missionForm.ruleType)
              ? <label>Meta de valor (R$)<input type="number" min="0.01" max="100000000" step="0.01" value={missionForm.targetAmount} onChange={(event) => updateMissionField('targetAmount', event.target.value)} required /></label>
              : missionForm.ruleType !== 'FIRST_PURCHASE' && <label>Meta de pedidos<input type="number" min="1" max="10000" step="1" value={missionForm.targetCount} onChange={(event) => updateMissionField('targetCount', event.target.value)} required /></label>}
            <label>Pontos concedidos<input type="number" min="1" max="1000000" step="1" value={missionForm.pointsReward} onChange={(event) => updateMissionField('pointsReward', event.target.value)} required /></label>
            <label>Limite total de recompensas<input type="number" min="1" max="10000000" step="1" value={missionForm.rewardLimit} onChange={(event) => updateMissionField('rewardLimit', event.target.value)} placeholder="Sem limite" /></label>
            <label>Recorrência<select value={missionForm.recurrence} onChange={(event) => updateMissionField('recurrence', event.target.value)} disabled={missionForm.ruleType === 'FIRST_PURCHASE'}><option value="none">Uma única vez</option><option value="weekly">Semanal, reinicia automaticamente</option></select></label>
            <label>Status<select value={missionForm.status} onChange={(event) => updateMissionField('status', event.target.value)}><option value="draft">Rascunho</option><option value="active">Ativa</option><option value="paused">Pausada</option><option value="archived">Arquivada</option></select></label>
            <label>Início<input type="datetime-local" value={missionForm.startsAt} onChange={(event) => updateMissionField('startsAt', event.target.value)} required /></label>
            <label>Encerramento{missionForm.pointsExpiryPolicy === 'FIXED_DATE' ? '' : ' (opcional)'}<input type="datetime-local" value={missionForm.endsAt} onChange={(event) => updateMissionField('endsAt', event.target.value)} required={missionForm.pointsExpiryPolicy === 'FIXED_DATE'} /></label>
            <label>Validade dos pontos<select value={missionForm.pointsExpiryPolicy} onChange={(event) => updateMissionField('pointsExpiryPolicy', event.target.value)}>{loyaltyPointExpiryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {missionForm.pointsExpiryPolicy === 'DAYS_AFTER_AWARD' && <label>Validade (dias)<input type="number" min="1" max="3650" step="1" value={missionForm.pointsExpiryDays} onChange={(event) => updateMissionField('pointsExpiryDays', event.target.value)} required /></label>}
            {missionForm.pointsExpiryPolicy === 'FIXED_DATE' && <label>Expiração dos pontos<input type="datetime-local" value={missionForm.pointsExpireAt} onChange={(event) => updateMissionField('pointsExpireAt', event.target.value)} required /></label>}
          </div>
          <div className="loyalty-form-actions">
            <button className="primary-cta" type="submit" disabled={savingMission}><Save size={15} aria-hidden="true" />{savingMission ? 'Salvando...' : editingMissionId ? 'Salvar missão' : 'Criar missão'}</button>
            {editingMissionId && <button className="editor-ghost" type="button" onClick={cancelMissionEdit}><X size={15} aria-hidden="true" />Cancelar</button>}
          </div>
        </form>

        <form className="notification-composer loyalty-admin-form" onSubmit={submitReward}>
          <div className="notification-composer-heading"><span className="notification-composer-icon"><Gift size={19} aria-hidden="true" /></span><div><h2>{editingRewardId ? 'Editar recompensa' : 'Criar recompensa'}</h2><p>O resgate gera um cupom pessoal de uso único.</p></div></div>
          <label>Nome da recompensa<input value={rewardForm.name} onChange={(event) => setRewardForm((current) => ({ ...current, name: event.target.value }))} minLength="3" maxLength="80" required /></label>
          <label>Descrição<textarea value={rewardForm.description} onChange={(event) => setRewardForm((current) => ({ ...current, description: event.target.value }))} maxLength="300" rows="2" /></label>
          <div className="loyalty-form-grid">
            <label>Custo em pontos<input type="number" min="1" max="1000000" step="1" value={rewardForm.pointsCost} onChange={(event) => setRewardForm((current) => ({ ...current, pointsCost: event.target.value }))} required /></label>
            <label>Desconto (%)<input type="number" min="1" max="90" step="1" value={rewardForm.discountPercent} onChange={(event) => setRewardForm((current) => ({ ...current, discountPercent: event.target.value }))} required /></label>
            <label>Pedido mínimo (R$)<input type="number" min="0" max="100000000" step="0.01" value={rewardForm.minimumOrderAmount} onChange={(event) => setRewardForm((current) => ({ ...current, minimumOrderAmount: event.target.value }))} required /></label>
            <label>Validade do cupom (dias)<input type="number" min="1" max="365" step="1" value={rewardForm.validityDays} onChange={(event) => setRewardForm((current) => ({ ...current, validityDays: event.target.value }))} required /></label>
            <label className="editor-checkbox"><input type="checkbox" checked={rewardForm.active} onChange={(event) => setRewardForm((current) => ({ ...current, active: event.target.checked }))} />Disponível para resgate</label>
          </div>
          <div className="loyalty-form-actions">
            <button className="primary-cta" type="submit" disabled={savingReward}><Save size={15} aria-hidden="true" />{savingReward ? 'Salvando...' : editingRewardId ? 'Salvar recompensa' : 'Criar recompensa'}</button>
            {editingRewardId && <button className="editor-ghost" type="button" onClick={cancelRewardEdit}><X size={15} aria-hidden="true" />Cancelar</button>}
          </div>
        </form>
      </div>

      <section className="loyalty-admin-results" aria-labelledby="loyalty-admin-missions-heading">
        <div className="loyalty-admin-section-heading"><div><span className="eyebrow">Acompanhamento</span><h2 id="loyalty-admin-missions-heading">Missões</h2></div></div>
        {missions.length ? <div className="loyalty-admin-list">
          {missions.map((mission) => <article className="loyalty-admin-card" key={mission.id}>
            <div className="loyalty-admin-card-main">
              <div><span className={statusClass(mission.status)}>{missionStatusLabels[mission.status] || mission.status}</span><h3>{mission.name}</h3><p>{mission.description || loyaltyMissionRuleOptions.find((item) => item.value === mission.ruleType)?.label}</p></div>
              <button className="editor-ghost" type="button" onClick={() => startMissionEdit(mission)} aria-label={`Editar missão ${mission.name}`}><Pencil size={15} aria-hidden="true" />Editar</button>
            </div>
            <div className="loyalty-admin-card-stats">
              <span><strong>{mission.participants}</strong> participações</span>
              <span><strong>{mission.completions}</strong> conclusões</span>
              <span><strong>{mission.pointsAwarded.toLocaleString('pt-BR')}</strong> pontos concedidos</span>
              <span><strong>{mission.claimedRewards}{mission.rewardLimit === null ? '' : ` / ${mission.rewardLimit}`}</strong> recompensas</span>
            </div>
            <small>{loyaltyMissionRuleOptions.find((item) => item.value === mission.ruleType)?.label} · {mission.recurrence === 'weekly' ? 'ciclo semanal' : 'ciclo único'} · {mission.pointsReward} pontos</small>
          </article>)}
        </div> : <div className="erp-empty-data">Nenhuma missão cadastrada.</div>}
      </section>

      <section className="loyalty-admin-results" aria-labelledby="loyalty-admin-rewards-heading">
        <div className="loyalty-admin-section-heading"><div><span className="eyebrow">Resgates</span><h2 id="loyalty-admin-rewards-heading">Recompensas</h2></div></div>
        {rewards.length ? <div className="loyalty-admin-list">
          {rewards.map((reward) => <article className="loyalty-admin-card loyalty-admin-reward" key={reward.id}>
            <div className="loyalty-admin-card-main">
              <div><span className={statusClass(reward.active ? 'active' : 'paused')}>{reward.active ? 'Disponível' : 'Indisponível'}</span><h3>{reward.name}</h3><p>{reward.description || `${reward.discountPercent}% de desconto`}</p></div>
              <button className="editor-ghost" type="button" onClick={() => startRewardEdit(reward)} aria-label={`Editar recompensa ${reward.name}`}><Pencil size={15} aria-hidden="true" />Editar</button>
            </div>
            <div className="loyalty-admin-card-stats">
              <span><strong>{reward.pointsCost.toLocaleString('pt-BR')}</strong> pontos</span>
              <span><strong>{reward.discountPercent}%</strong> desconto</span>
              <span><strong>{currencyFormatter.format(reward.minimumOrderAmount)}</strong> pedido mínimo</span>
              <span><strong>{reward.redemptions}</strong> resgates</span>
            </div>
          </article>)}
        </div> : <div className="erp-empty-data">Nenhuma recompensa cadastrada.</div>}
      </section>
    </>}
  </div>;
}
