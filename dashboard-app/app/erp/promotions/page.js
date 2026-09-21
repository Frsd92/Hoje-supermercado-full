'use client';

import { Bell, Megaphone, Send } from 'lucide-react';
import { useState } from 'react';

export default function PromotionsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState('all');
  const [recipients, setRecipients] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [feedback, setFeedback] = useState('');

  const sendNotification = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, message, audience, recipients: recipients.split(','), durationDays: Number(durationDays) }),
    });
    const data = await response.json();
    if (!response.ok) return setFeedback(data.error || 'Não foi possível enviar a notificação.');
    setTitle('');
    setMessage('');
    setRecipients('');
    setDurationDays('7');
    setFeedback('Notificação enviada. Os clientes receberão o aviso no navegador.');
  };

  return <div className="erp-module-page"><div className="erp-customer-header"><div><span className="eyebrow">Relacionamento</span><h1>Comunicação</h1><p>Envie novidades, avisos e ofertas para clientes com o site aberto, mesmo em outra aba.</p></div></div><form className="notification-composer" onSubmit={sendNotification}><div className="notification-composer-heading"><span className="notification-composer-icon"><Bell size={19} /></span><div><h2>Nova comunicação</h2><p>O navegador exibirá a mensagem assim que ela chegar.</p></div></div><label>Título<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Oferta especial de hoje" required /></label><label>Mensagem<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva o que o cliente deve saber..." rows="4" required /></label><label>Destinatários<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">Todos os clientes</option><option value="selected">Clientes selecionados</option></select></label>{audience === 'selected' && <label>E-mails dos clientes<input value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="cliente@email.com, outro@email.com" required /><small>Separe os e-mails por vírgula.</small></label>}<label>Duração da mensagem (dias)<input type="number" min="1" max="365" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required /><small>Depois desse prazo, a mensagem deixa de aparecer no sino do cliente.</small></label><button className="primary-cta"><Send size={15} /> Enviar comunicação</button>{feedback && <p className="notification-feedback">{feedback}</p>}</form><div className="erp-empty-data"><Megaphone size={17} /> As mensagens enviadas serão direcionadas apenas a clientes autenticados que tenham permitido notificações no navegador.</div></div>;
}