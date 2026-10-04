'use client';

import { Bell, CheckSquare, Search, Send, TicketPercent } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { consumeErpRecipientHandoff } from '@/features/erp/customer-recipient-handoff';

export default function PromotionsPage() {
  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('10');
  const [durationDays, setDurationDays] = useState('7');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    let active = true;
    let recipientHandoffEmail = null;
    try {
      recipientHandoffEmail = consumeErpRecipientHandoff('promotions');
    } catch (error) {
      console.error('Não foi possível recuperar o destinatário do cupom:', error);
      setFeedback('Não foi possível preparar o destinatário. Selecione-o novamente antes de enviar.');
      setFeedbackError(true);
    }
    Promise.all([fetch('/api/erp/customers'), fetch('/api/erp/coupons')])
      .then(async ([customerResponse, campaignResponse]) => {
        const [customerData, campaignData] = await Promise.all([customerResponse.json(), campaignResponse.json()]);
        if (!customerResponse.ok) throw new Error(customerData.error || 'Não foi possível carregar os clientes.');
        if (!campaignResponse.ok) throw new Error(campaignData.error || 'Não foi possível carregar os cupons enviados.');
        if (active) {
          const nextCustomers = Array.isArray(customerData.customers) ? customerData.customers : [];
          setCustomers(nextCustomers);
          setCampaigns(campaignData.campaigns || []);
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
      .finally(() => { if (active) setLoading(false); });
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
      setCampaigns((current) => [data.campaign, ...current.filter((campaign) => campaign.id !== data.campaign.id)]);
      setSelectedEmails([]);
      setCode('');
      setMessage('');
      setDiscountPercent('10');
      setDurationDays('7');
      setFeedback(data.campaign.addedRecipientsCount === data.campaign.recipientsCount
        ? `Cupom ${data.campaign.code} enviado para ${data.campaign.addedRecipientsCount} cliente(s).`
        : `Cupom ${data.campaign.code} enviado para mais ${data.campaign.addedRecipientsCount} cliente(s). Agora são ${data.campaign.recipientsCount} destinatário(s).`);
    } catch (error) {
      setFeedback(error.message);
      setFeedbackError(true);
    } finally {
      setSending(false);
    }
  };

  return <div className="erp-module-page">
    <div className="erp-customer-header"><div><span className="eyebrow">Relacionamento com clientes</span><h1>Cupons direcionados</h1><p>Crie descontos e escolha exatamente quais clientes vão recebê-los.</p></div></div>
    <div className="coupon-delivery-note"><Bell size={18} /><span>Um mesmo cupom pode ser enviado a vários clientes, inclusive em envios separados. Cada destinatário pode usá-lo uma vez até o vencimento; novos clientes podem ser adicionados ao cupom existente.</span></div>
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
        {feedback && <p className={`notification-feedback ${feedbackError ? 'error' : 'success'}`} role="status">{feedback}</p>}
      </form>
      <section className="coupon-campaign-panel">
        <div className="notification-composer-heading"><span className="notification-composer-icon"><TicketPercent size={19} /></span><div><h2>Cupons enviados</h2><p>Histórico de campanhas desta loja.</p></div></div>
        {campaigns.length ? <div className="coupon-campaign-list">{campaigns.map((campaign) => <article className="coupon-campaign-card" key={campaign.id}><div><strong>{campaign.code}</strong><span>{campaign.discountPercent}% de desconto</span></div><p>{campaign.message}</p><small>{campaign.recipientsCount} destinatário(s) · Válido até {new Date(campaign.expiresAt).toLocaleDateString('pt-BR')}</small>{new Date(campaign.expiresAt).getTime() > Date.now() && <button type="button" className="editor-ghost" onClick={() => reuseCampaign(campaign)}>Enviar para mais clientes</button>}</article>)}</div> : <div className="erp-empty-data">{loading ? 'Carregando campanhas...' : 'Nenhum cupom enviado ainda.'}</div>}
      </section>
    </div>
  </div>;
}
