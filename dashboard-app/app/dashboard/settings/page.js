'use client';

import { Bell, Check, Lock, ShieldAlert, Truck, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

const initialSettings = {
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
  promotions: true,
  orderStatus: true,
  dataSharing: false,
  usageAnalysis: true,
  personalizedMarketing: false,
  theme: 'Escuro',
  language: 'Portugues (Brasil)',
  currency: 'Real (R$)',
  deliveryWindow: 'Manha (8h - 12h)',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    try {
      setSettings((current) => ({ ...current, ...JSON.parse(localStorage.getItem('dashboard-settings') || '{}') }));
    } catch {
      setSettings(initialSettings);
    }
  }, []);

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === 'theme') {
      try {
        const savedSettings = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
        localStorage.setItem('dashboard-settings', JSON.stringify({ ...savedSettings, theme: value }));
        window.dispatchEvent(new Event('dashboard-theme-updated'));
      } catch (error) {
        setFeedback(`Não foi possível salvar o tema: ${error.message}`);
      }
    }
  };
  const toggle = async (key) => {
    const nextValue = !settings[key];
    if (key === 'pushNotifications' && nextValue && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    updateSetting(key, nextValue);
  };
  const saveSettings = () => {
    localStorage.setItem('dashboard-settings', JSON.stringify(settings));
    window.dispatchEvent(new Event('dashboard-settings-updated'));
    window.dispatchEvent(new Event('dashboard-theme-updated'));
    setFeedback('Configurações salvas com sucesso.');
  };
  const restoreSettings = () => {
    setSettings(initialSettings);
    localStorage.removeItem('dashboard-settings');
    window.dispatchEvent(new Event('dashboard-settings-updated'));
    window.dispatchEvent(new Event('dashboard-theme-updated'));
    setFeedback('Configurações restauradas.');
  };

  const renderToggle = (label, key, description) => (
    <div className="settings-option">
      <div><strong>{label}</strong><small>{description}</small></div>
      <button type="button" className="settings-toggle" aria-label={`Alternar ${label}`} aria-pressed={settings[key]} onClick={() => toggle(key)}><span className={settings[key] ? 'on' : ''} /></button>
    </div>
  );

  return (
    <div className="section-shell settings-page">
      <div className="page-header-block settings-page-header"><span className="settings-kicker">Conta e privacidade</span><h1>Configurações</h1><p>Gerencie suas preferências, notificações e escolhas de privacidade.</p></div>
      <div className="settings-dashboard-grid">
        <section className="settings-panel"><div className="settings-panel-heading"><Bell size={16} /><div><h3>Notificações</h3><p>Configure como você quer receber avisos.</p></div></div>{renderToggle('Notificações por e-mail', 'emailNotifications', 'Receba atualizações no seu e-mail')}{renderToggle('Notificações por SMS', 'smsNotifications', 'Receba alertas importantes por mensagem')}{renderToggle('Notificações push', 'pushNotifications', 'Receba avisos instantâneos sobre seus pedidos')}{renderToggle('Ofertas e promoções', 'promotions', 'Receba novidades e ofertas da loja')}{renderToggle('Status dos pedidos', 'orderStatus', 'Acompanhe atualizações das suas entregas')}</section>
        <section className="settings-panel"><div className="settings-panel-heading"><Lock size={16} /><div><h3>Privacidade</h3><p>Controle como seus dados são utilizados.</p></div></div>{renderToggle('Compartilhamento de dados', 'dataSharing', 'Permita o compartilhamento com parceiros')}{renderToggle('Análise de uso', 'usageAnalysis', 'Ajude a melhorar nossos serviços')}{renderToggle('Marketing personalizado', 'personalizedMarketing', 'Receba ofertas baseadas no seu perfil')}</section>
        <section className="settings-panel"><div className="settings-panel-heading"><UserRound size={16} /><div><h3>Preferências</h3><p>Personalize sua experiência.</p></div></div><label className="settings-select-field">Tema<select value={settings.theme} onChange={(event) => updateSetting('theme', event.target.value)}><option value="Claro">Claro</option><option value="Escuro">Escuro</option><option value="Automatico">Automático</option></select></label><label className="settings-select-field">Idioma<select value={settings.language} onChange={(event) => updateSetting('language', event.target.value)}><option value="Portugues (Brasil)">Português (Brasil)</option><option value="English">English</option></select></label><label className="settings-select-field">Moeda<select value={settings.currency} onChange={(event) => updateSetting('currency', event.target.value)}><option value="Real (R$)">Real (R$)</option><option value="Dolar (US$)">Dólar (US$)</option></select></label></section>
        <section className="settings-panel"><div className="settings-panel-heading"><Truck size={16} /><div><h3>Entrega</h3><p>Configure suas preferências de entrega.</p></div></div><label className="settings-select-field">Horário preferido<select value={settings.deliveryWindow} onChange={(event) => updateSetting('deliveryWindow', event.target.value)}><option value="Manha (8h - 12h)">Manhã (8h–12h)</option><option value="Tarde (12h - 18h)">Tarde (12h–18h)</option><option value="Noite (18h - 22h)">Noite (18h–22h)</option></select></label></section>
      </div>
      <section className="settings-danger-panel"><div className="settings-panel-heading danger-heading"><ShieldAlert size={16} /><div><h3>Zona de Perigo</h3><p>Ações sensíveis da conta e dos seus dados</p></div></div><div className="lgpd-notice"><strong>Seus direitos pela LGPD</strong><p>A Lei nº 13.709/2018 (LGPD), no art. 18, VI, garante o direito de solicitar a eliminação de dados pessoais tratados com consentimento, respeitadas as exceções legais do art. 16 e outras obrigações de retenção.</p></div><div className="danger-action"><div><strong>Restaurar Configurações</strong><small>Volta todas as configurações para o padrão</small></div><button type="button" className="danger-outline" onClick={restoreSettings}>Restaurar</button></div><div className="danger-action"><div><strong>Excluir Conta</strong><small>Solicitação de exclusão sujeita à análise das obrigações legais de retenção.</small></div><button type="button" className="danger-solid" onClick={() => setFeedback('Sua solicitação de exclusão foi registrada para análise conforme a LGPD.')}>Excluir Conta</button></div></section>
      <div className="settings-footer-actions"><button type="button" className="secondary-cta" onClick={restoreSettings}>Restaurar padrões</button><div>{feedback && <span className={`settings-feedback ${feedback.startsWith('Não foi') ? 'error' : ''}`} role="status" aria-live="polite"><Check size={14} /> {feedback}</span>}<button type="button" className="primary-cta" onClick={saveSettings}><Check size={14} /> Salvar configurações</button></div></div>
    </div>
  );
}
