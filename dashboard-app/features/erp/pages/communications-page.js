'use client';

import { Bell, CheckSquare, Search, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { consumeErpRecipientHandoff } from '@/features/erp/customer-recipient-handoff';

export default function CommunicationsPage() {
  const [customers, setCustomers] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [audience, setAudience] = useState('all');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    let active = true;
    let recipientHandoffEmail = null;
    try {
      recipientHandoffEmail = consumeErpRecipientHandoff('communications');
    } catch (error) {
      console.error('Não foi possível recuperar o destinatário do comunicado:', error);
      setFeedback('Não foi possível preparar o destinatário. Selecione-o novamente antes de enviar.');
      setFeedbackError(true);
    }
    fetch('/api/erp/customers')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os clientes.');
        if (active) {
          const nextCustomers = Array.isArray(data.customers) ? data.customers : [];
          setCustomers(nextCustomers);
          if (recipientHandoffEmail) {
            const recipient = nextCustomers.find((customer) => customer.email.toLowerCase() === recipientHandoffEmail);
            if (recipient) {
              setSelectedEmails([recipient.email.toLowerCase()]);
              setAudience('selected');
              setTitle((current) => current || 'Sentimos sua falta!');
              setMessage((current) => current || 'Percebemos que você deixou produtos no carrinho. Volte para finalizar sua compra quando quiser.');
              setFeedback(`${recipient.name} está selecionado para receber o comunicado.`);
              setFeedbackError(false);
            } else {
              setFeedback('O cliente do carrinho não está mais disponível para receber comunicados.');
              setFeedbackError(true);
            }
          }
        }
      })
      .catch((error) => {
        if (active) {
          setFeedback(error.message);
          setFeedbackError(true);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return customers.filter((customer) => !query
      || customer.name.toLocaleLowerCase('pt-BR').includes(query)
      || customer.email.toLocaleLowerCase('pt-BR').includes(query));
  }, [customers, search]);

  const visibleEmails = filteredCustomers.map((customer) => customer.email.toLowerCase());
  const allVisibleSelected = visibleEmails.length > 0 && visibleEmails.every((email) => selectedEmails.includes(email));

  const toggleAllVisible = () => {
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

  const sendNotification = async (event) => {
    event.preventDefault();
    setSending(true);
    setFeedback('');
    setFeedbackError(false);
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          durationDays: Number(durationDays),
          audience,
          recipients: audience === 'selected' ? selectedEmails : [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o comunicado.');
      setTitle('');
      setMessage('');
      setDurationDays('7');
      setSelectedEmails([]);
      setFeedback(audience === 'all'
        ? 'Comunicado enviado para todos os clientes. Ele aparecerá no sino do Dashboard.'
        : `Comunicado enviado para ${data.notification.recipients.length} cliente(s). Ele aparecerá no sino do Dashboard.`);
    } catch (error) {
      setFeedback(error.message);
      setFeedbackError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="erp-module-page">
      <div className="erp-customer-header">
        <div><span className="eyebrow">Relacionamento com clientes</span><h1>Comunicação</h1><p>Envie avisos para aparecerem no sino de notificações do Dashboard do cliente.</p></div>
      </div>
      <div className="coupon-delivery-note"><Bell size={18} /><span>Escolha enviar para todos os clientes ou selecione destinatários específicos. Cada comunicado expira conforme a validade definida.</span></div>
      <form className="notification-composer" onSubmit={sendNotification}>
        <div className="notification-composer-heading"><span className="notification-composer-icon"><Bell size={19} /></span><div><h2>Novo comunicado</h2><p>Prepare o aviso e escolha quem receberá a notificação.</p></div></div>
        <div className="coupon-form-row">
          <label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} required /></label>
          <label>Validade (dias)<input type="number" min="1" max="365" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /></label>
          <label>Destinatários<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">Todos os clientes</option><option value="selected">Clientes selecionados</option></select></label>
        </div>
        <label>Mensagem<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={500} rows="4" required /></label>
        {audience === 'selected' && <>
          <div className="coupon-recipient-heading"><div><strong>Quem vai receber?</strong><span>{selectedEmails.length} selecionado(s) de {customers.length}</span></div><label className="coupon-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou e-mail" /></label></div>
          <div className="coupon-recipient-list">
            {loading ? <div className="erp-empty-data">Carregando clientes...</div> : filteredCustomers.length ? <>
              <label className="coupon-recipient-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /><CheckSquare size={15} />Selecionar clientes exibidos</label>
              {filteredCustomers.map((customer) => {
                const email = customer.email.toLowerCase();
                return <label className="coupon-recipient" key={email}><input type="checkbox" checked={selectedEmails.includes(email)} onChange={() => toggleCustomer(email)} /><span><strong>{customer.name}</strong><small>{customer.email}</small></span><small>{customer.orders} pedido(s)</small></label>;
              })}
            </> : <div className="erp-empty-data">Nenhum cliente corresponde à busca.</div>}
          </div>
        </>}
        <button className="primary-cta" type="submit" disabled={sending || (audience === 'selected' && (loading || !selectedEmails.length))}><Send size={15} />{sending ? 'Enviando...' : 'Enviar comunicado'}</button>
        {feedback && <p className={`notification-feedback ${feedbackError ? 'error' : 'success'}`} role="status">{feedback}</p>}
      </form>
    </div>
  );
}
