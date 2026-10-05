'use client';

import { Bell, CheckCheck, CheckSquare, CircleDollarSign, RefreshCw, Search, Send, TicketPercent, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { consumeErpRecipientHandoff } from '@/features/erp/customer-recipient-handoff';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

async function loadCouponCampaigns() {
  const response = await fetch('/api/erp/coupons', { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os cupons enviados.');
  if (!Array.isArray(data.campaigns)) throw new Error('A resposta das campanhas de cupom está em um formato inválido.');
  return data.campaigns;
}

function money(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(date);
}

function getRecipientStatusLabel(recipient) {
  if (recipient.status === 'redeemed' && recipient.orderStatus === 'Cancelado') return 'Resgatado · pedido cancelado';
  return recipientStatusLabels[recipient.status] || 'Não rastreado';
}

const campaignStatusLabels = {
  active: 'Em andamento',
  fully_redeemed: 'Público atual resgatado',
  expired: 'Expirado',
};

const recipientStatusLabels = {
  available: 'Disponível',
  processing: 'Pagamento em processamento',
  redeemed: 'Resgatado',
  expired: 'Expirado',
};

export default function PromotionsPage() {
  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [durationDays, setDurationDays] = useState('7');
  const [message, setMessage] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshingCampaigns, setRefreshingCampaigns] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    let active = true;
    setRefreshingCampaigns(true);
    let recipientHandoffEmail = null;
    try {
      recipientHandoffEmail = consumeErpRecipientHandoff('promotions');
    } catch (error) {
      console.error('Não foi possível recuperar o destinatário do cupom:', error);
      setFeedback('Não foi possível preparar o destinatário. Selecione-o novamente antes de enviar.');
      setFeedbackError(true);
    }
    Promise.all([
      fetch('/api/erp/customers', { cache: 'no-store' }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os clientes.');
        return data;
      }),
      loadCouponCampaigns(),
    ])
      .then(([customerData, nextCampaigns]) => {
        if (active) {
          const nextCustomers = Array.isArray(customerData.customers) ? customerData.customers : [];
          setCustomers(nextCustomers);
          setCampaigns(nextCampaigns);
          if (recipientHandoffEmail) {
            const recipient = nextCustomers.find((customer) => customer.email.toLowerCase() === recipientHandoffEmail);
            if (recipient) {
              setSelectedEmails([recipient.email.toLowerCase()]);
              setMessage((current) => current || 'Aproveite para voltar e concluir sua compra.');
              setFeedback(`${recipient.name} está selecionado para receber o cupom. Revise o desconto e a validade antes de enviar.`);
              setFeedbackError(false);
            } else {
              setFeedback('O cliente do carrinho não está mais disponível para receber cupons.');
              setFeedbackError(true);
            }
          }
        }
      })
      .catch((error) => { if (active) { setFeedback(error.message); setFeedbackError(true); } })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshingCampaigns(false);
        }
      });
    return () => { active = false; };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => !query || customer.name.toLowerCase().includes(query) || customer.email.toLowerCase().includes(query));
  }, [customers, search]);

  const selectedCampaign = campaigns.find((campaign) => campaign.code === code && new Date(campaign.expiresAt).getTime() > Date.now());
  const selectableCustomers = filteredCustomers.filter((customer) => !selectedCampaign?.recipientEmails?.includes(customer.email.toLowerCase()));
  const visibleSelected = selectableCustomers.filter((customer) => selectedEmails.includes(customer.email.toLowerCase())).length;
  const allVisibleSelected = selectableCustomers.length > 0 && visibleSelected === selectableCustomers.length;
  const visibleCampaigns = useMemo(() => campaigns.filter((campaign) => (
    campaignFilter === 'all'
    || (campaignFilter === 'active' && campaign.status !== 'expired')
    || (campaignFilter === 'expired' && campaign.status === 'expired')
  )), [campaigns, campaignFilter]);
  const campaignSummary = useMemo(() => {
    const recipients = campaigns.reduce((sum, campaign) => sum + campaign.recipientsCount, 0);
    const redeemed = campaigns.reduce((sum, campaign) => sum + campaign.redeemedCount, 0);
    return {
      active: campaigns.filter((campaign) => campaign.status !== 'expired').length,
      recipients,
      redeemed,
      redemptionRate: recipients ? Number((redeemed / recipients * 100).toFixed(1)) : 0,
      orders: campaigns.reduce((sum, campaign) => sum + campaign.ordersCount, 0),
      revenue: campaigns.reduce((sum, campaign) => sum + campaign.revenue, 0),
      discount: campaigns.reduce((sum, campaign) => sum + campaign.discountGiven, 0),
    };
  }, [campaigns]);

  const updateCode = (value) => {
    const nextCode = value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    setCode(nextCode);
    const campaign = campaigns.find((item) => item.code === nextCode && new Date(item.expiresAt).getTime() > Date.now());
    if (campaign) {
      setDiscountPercent(String(campaign.discountPercent));
      setDurationDays(String(Math.max(1, Math.ceil((new Date(campaign.expiresAt).getTime() - Date.now()) / 86400000))));
      setMessage('');
    }
  };

  const reuseCampaign = (campaign) => {
    setCode(campaign.code);
    setDiscountPercent(String(campaign.discountPercent));
    setDurationDays(String(Math.max(1, Math.ceil((new Date(campaign.expiresAt).getTime() - Date.now()) / 86400000))));
    setMessage('');
    setSelectedEmails([]);
    setFeedback(`Selecione novos clientes para adicionar ao cupom ${campaign.code}.`);
    setFeedbackError(false);
  };

  const toggleAllVisible = () => {
    const visibleEmails = selectableCustomers.map((customer) => customer.email.toLowerCase());
    setSelectedEmails((current) => allVisibleSelected
      ? current.filter((email) => !visibleEmails.includes(email))
      : [...new Set([...current, ...visibleEmails])]);
  };

  const toggleCustomer = (email) => {
    const normalizedEmail = email.toLowerCase();
    setSelectedEmails((current) => current.includes(normalizedEmail)
      ? current.filter((selectedEmail) => selectedEmail !== normalizedEmail)
      : [...current, normalizedEmail]);
  };

  const refreshCampaignList = async () => {
    setRefreshingCampaigns(true);
    try {
      setCampaigns(await loadCouponCampaigns());
      return '';
    } catch (error) {
      console.error('Não foi possível atualizar o controle dos cupons:', error);
      return error.message || 'Não foi possível atualizar os cupons.';
    } finally {
      setRefreshingCampaigns(false);
    }
  };

  const sendCoupon = async (event) => {
    event.preventDefault();
    setSending(true);
    setFeedback('');
    setFeedbackError(false);
    try {
      const response = await fetch('/api/erp/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          discountPercent: Number(discountPercent),
          durationDays: Number(durationDays),
          recipients: selectedEmails,
          message,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o cupom.');
      const refreshError = await refreshCampaignList();
      setSelectedEmails([]);
      setCode('');
      setMessage('');
      setDiscountPercent('10');
      setDurationDays('7');
      const successMessage = data.campaign.addedRecipientsCount === data.campaign.recipientsCount
        ? `Cupom ${data.campaign.code} enviado para ${data.campaign.addedRecipientsCount} cliente(s).`
        : `Cupom ${data.campaign.code} enviado para mais ${data.campaign.addedRecipientsCount} cliente(s). Agora são ${data.campaign.recipientsCount} destinatário(s).`;
      setFeedback(refreshError
        ? `${successMessage} O envio foi concluído, mas os indicadores não atualizaram: ${refreshError}`
        : successMessage);
      setFeedbackError(Boolean(refreshError));
    } catch (error) {
      setFeedback(error.message);
      setFeedbackError(true);
    } finally {
      setSending(false);
    }
  };

  return <div className="erp-module-page">
    <div className="erp-customer-header"><div><span className="eyebrow">Relacionamento com clientes</span><h1>Cupons direcionados</h1><p>Crie ofertas personalizadas, acompanhe resgates e confira o resultado de cada campanha.</p></div></div>
    <div className="coupon-delivery-note"><Bell size={18} aria-hidden="true" /><span>O cliente encontra o cupom no Dashboard. Cada código é vinculado aos destinatários, vale uma vez por cliente até o vencimento e pode ser usado junto a promoções de produtos; apenas um cupom pode ser aplicado em cada pedido.</span></div>
    <section className="coupon-management-summary" aria-label="Indicadores gerais de cupons">
      <div><TicketPercent size={18} aria-hidden="true" /><span>Campanhas vigentes</span><strong>{campaignSummary.active}</strong></div>
      <div><Users size={18} aria-hidden="true" /><span>Cupons enviados</span><strong>{campaignSummary.recipients}</strong></div>
      <div><CheckCheck size={18} aria-hidden="true" /><span>Resgates · conversão</span><strong>{campaignSummary.redeemed} · {campaignSummary.redemptionRate.toLocaleString('pt-BR')}%</strong></div>
      <div><TrendingUp size={18} aria-hidden="true" /><span>Pedidos não cancelados</span><strong>{campaignSummary.orders}</strong></div>
      <div><CircleDollarSign size={18} aria-hidden="true" /><span>Venda líquida associada</span><strong>{money(campaignSummary.revenue)}</strong></div>
      <div><TicketPercent size={18} aria-hidden="true" /><span>Descontos concedidos</span><strong>{money(campaignSummary.discount)}</strong></div>
    </section>
    <div className="coupon-manager-grid">
      <form className="notification-composer coupon-composer" onSubmit={sendCoupon}>
        <div className="notification-composer-heading"><span className="notification-composer-icon"><TicketPercent size={19} /></span><div><h2>{selectedCampaign ? `Adicionar clientes ao ${selectedCampaign.code}` : 'Criar e enviar cupom'}</h2><p>{selectedCampaign ? 'O desconto e a validade existentes serão mantidos.' : 'Defina o desconto, a validade e o público.'}</p></div></div>
        <div className="coupon-form-row">
        <label>Código do cupom<input value={code} onChange={(event) => updateCode(event.target.value)} placeholder="Ex.: CLIENTE15" minLength="3" maxLength="24" required /><small>{selectedCampaign ? 'Cupom existente: os novos destinatários terão o mesmo desconto e vencimento.' : 'Digite um código novo ou selecione um cupom enviado abaixo.'}</small></label>
        <label>Desconto (%)<input type="number" min="1" max="90" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} disabled={Boolean(selectedCampaign)} required /></label>
        <label>Validade (dias)<input type="number" min="1" max="365" step="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} disabled={Boolean(selectedCampaign)} required /></label>
        </div>
        <label>Mensagem opcional<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ex.: Aproveite para fazer suas compras da semana." rows="3" maxLength="300" /><small>A mensagem será exibida junto ao código no Dashboard do cliente.</small></label>
        <div className="coupon-recipient-heading"><div><strong>Quem vai receber?</strong><span>{selectedEmails.length} selecionado(s) de {customers.length}</span></div><label className="coupon-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou e-mail" /></label></div>
        <div className="coupon-recipient-list">
          {loading ? <div className="erp-empty-data">Carregando clientes...</div> : filteredCustomers.length ? <>
            <label className="coupon-recipient-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /><CheckSquare size={15} />Selecionar clientes exibidos</label>
            {filteredCustomers.map((customer) => {
              const email = customer.email.toLowerCase();
              const alreadyReceived = selectedCampaign?.recipientEmails?.includes(email) || false;
              return <label className="coupon-recipient" key={email}><input type="checkbox" checked={alreadyReceived || selectedEmails.includes(email)} disabled={alreadyReceived} onChange={() => toggleCustomer(email)} /><span><strong>{customer.name}</strong><small>{customer.email}</small></span><small>{alreadyReceived ? 'Já recebeu' : `${customer.orders} pedido(s)`}</small></label>;
            })}
          </> : <div className="erp-empty-data">{customers.length ? 'Nenhum cliente corresponde à busca.' : 'Nenhum cliente cadastrado foi encontrado.'}</div>}
        </div>
        <button className="primary-cta" type="submit" disabled={loading || sending || !selectedEmails.length}><Send size={15} />{sending ? 'Enviando...' : `Enviar para ${selectedEmails.length} cliente(s)`}</button>
        {feedback && <p className={`notification-feedback ${feedbackError ? 'error' : 'success'}`} role={feedbackError ? 'alert' : 'status'} aria-live={feedbackError ? 'assertive' : 'polite'}>{feedback}</p>}
      </form>
      <section className="coupon-campaign-panel">
        <div className="coupon-campaign-heading">
          <div className="notification-composer-heading"><span className="notification-composer-icon"><TicketPercent size={19} aria-hidden="true" /></span><div><h2>Controle e rastreio</h2><p>Desempenho, validade e situação de cada destinatário.</p></div></div>
          <button type="button" className="editor-ghost" onClick={async () => {
            const refreshError = await refreshCampaignList();
            setFeedback(refreshError || 'Indicadores de cupons atualizados.');
            setFeedbackError(Boolean(refreshError));
          }} disabled={refreshingCampaigns} aria-label="Atualizar controle dos cupons">
            <RefreshCw size={15} aria-hidden="true" />{refreshingCampaigns ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        <div className="coupon-campaign-filters" role="group" aria-label="Filtrar campanhas por situação">
          {[
            { value: 'all', label: `Todas (${campaigns.length})` },
            { value: 'active', label: `Vigentes (${campaigns.filter((campaign) => campaign.status !== 'expired').length})` },
            { value: 'expired', label: `Expiradas (${campaigns.filter((campaign) => campaign.status === 'expired').length})` },
          ].map((filter) => <button
            key={filter.value}
            type="button"
            className={campaignFilter === filter.value ? 'active' : ''}
            aria-pressed={campaignFilter === filter.value}
            onClick={() => setCampaignFilter(filter.value)}
          >{filter.label}</button>)}
        </div>
        {visibleCampaigns.length ? <div className="coupon-campaign-list">
          {visibleCampaigns.map((campaign) => <article className="coupon-campaign-card" key={campaign.id}>
            <div className="coupon-campaign-card-heading">
              <div><strong>{campaign.code}</strong><span>{campaign.discountPercent}% de desconto</span></div>
              <span className={`coupon-campaign-status status-${campaign.status}`}>{campaignStatusLabels[campaign.status] || 'Situação não identificada'}</span>
            </div>
            <p>{campaign.message || 'Cupom direcionado aos clientes selecionados.'}</p>
            <small>{campaign.recipientsCount} destinatário(s) · Criado em {formatDate(campaign.createdAt)} · Válido até {formatDate(campaign.expiresAt)}</small>
            <div className="coupon-campaign-stats" aria-label={`Desempenho do cupom ${campaign.code}`}>
              <div><strong>{campaign.redeemedCount}/{campaign.recipientsCount}</strong><span>resgates · {campaign.redemptionRate.toLocaleString('pt-BR')}%</span></div>
              <div><strong>{campaign.availableCount}</strong><span>disponível(is)</span></div>
              <div><strong>{campaign.ordersCount}</strong><span>pedido(s) não cancelado(s)</span></div>
              <div><strong>{campaign.cancelledOrdersCount}</strong><span>pedido(s) cancelado(s)</span></div>
              <div><strong>{money(campaign.revenue)}</strong><span>venda líquida associada</span></div>
              <div><strong>{money(campaign.discountGiven)}</strong><span>desconto concedido</span></div>
            </div>
            <details className="coupon-recipient-tracking">
              <summary>Rastrear destinatários ({campaign.recipientStatuses.length})</summary>
              {campaign.recipientStatuses.length ? <ul className="coupon-recipient-tracking-list">
                {campaign.recipientStatuses.map((recipient) => <li key={recipient.email}>
                  <span><strong>{recipient.email}</strong><small>{recipient.redeemedAt ? `Usado em ${formatDate(recipient.redeemedAt)}` : campaign.status === 'expired' ? `Expirou em ${formatDate(campaign.expiresAt)}` : `Válido até ${formatDate(campaign.expiresAt)}`}</small></span>
                  <span className={`coupon-recipient-state state-${recipient.status}`}>{getRecipientStatusLabel(recipient)}</span>
                  <small>{recipient.orderId ? `Pedido ${recipient.orderId}${recipient.orderStatus ? ` · ${recipient.orderStatus}` : ''}` : 'Sem pedido registrado'}</small>
                </li>)}
              </ul> : <div className="erp-empty-data">Esta campanha ainda não possui destinatários.</div>}
            </details>
            {campaign.status !== 'expired' && <button type="button" className="editor-ghost" onClick={() => reuseCampaign(campaign)}>Adicionar novos clientes</button>}
          </article>)}
        </div> : <div className="erp-empty-data">{loading ? 'Carregando campanhas...' : campaigns.length ? 'Nenhuma campanha nesta situação.' : 'Nenhum cupom enviado ainda.'}</div>}
      </section>
    </div>
  </div>;
}
