'use client';

import { AlertCircle, CheckCircle2, ClipboardList, Clock3, CreditCard, FileText, MapPin, PackageCheck, Printer, RotateCcw, Search, ShoppingBag, Truck, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import OrderReceipt from '@/features/orders/order-receipt';
import OrderPickingList from '@/features/orders/order-picking-list';
import { getRemainingRefundCents, refundRequestStatus, refundRequestStatusLabels } from '@/features/orders/order-refund-utils';

const statuses = ['Todos', 'Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido', 'Cancelado'];
const paymentLabels = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro / combinar' };
const paymentStatusLabels = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  failed: 'Pagamento não aprovado',
  canceled: 'Pagamento cancelado',
  partially_refunded: 'Estorno parcial',
  refunded: 'Estornado',
  manual: 'Pagamento manual / combinado',
};
const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatInvoiceCpf = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
};
const formatDateTime = (value) => {
  if (!value) return 'Data não informada';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
};

export default function ERPOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('Todos');
  const [cpfRequestFilter, setCpfRequestFilter] = useState('all');
  const [refundFilter, setRefundFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [acknowledged, setAcknowledged] = useState([]);
  const [selected, setSelected] = useState(null);
  const [printDocument, setPrintDocument] = useState(null);
  const printDialogRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [refundBusyId, setRefundBusyId] = useState('');
  const [refundActionError, setRefundActionError] = useState('');
  const [refundActionNotice, setRefundActionNotice] = useState('');
  const [refundDecisionNotes, setRefundDecisionNotes] = useState({});
  const [internalRefundAmount, setInternalRefundAmount] = useState('');
  const [internalRefundReason, setInternalRefundReason] = useState('');
  const [internalRefundBusy, setInternalRefundBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/erp/orders', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os pedidos.');
        if (!Array.isArray(data.orders)) throw new Error('A resposta de pedidos está inválida.');
        if (active) {
          setOrders(data.orders);
          setOrdersLoaded(true);
          setLoadError('');
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message || 'Não foi possível carregar os pedidos.');
      })
      .finally(() => { if (active) setLoading(false); });
    setAcknowledged(JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]'));
    return () => { active = false; };
  }, [reloadToken]);

  useEffect(() => {
    const dialog = printDialogRef.current;
    if (printDocument && dialog && !dialog.open) dialog.showModal();
  }, [printDocument]);

  useEffect(() => {
    setInternalRefundAmount('');
    setInternalRefundReason('');
  }, [selected?.id]);

  const newOrders = orders.filter((order) => order.status === 'Recebido' && !acknowledged.includes(order.id));
  const isPickingList = printDocument?.type === 'picking-list';
  const acknowledge = (id) => {
    const next = [...acknowledged, id];
    setAcknowledged(next);
    localStorage.setItem('erp-acknowledged-orders', JSON.stringify(next));
    window.dispatchEvent(new Event('erp-orders-updated'));
  };

  const advanceOrder = async (order) => {
    const nextStatus = { Recebido: 'Separacao', Separacao: 'Expedicao', Expedicao: 'Em transito', 'Em transito': 'Concluido' }[order.status];
    if (!nextStatus) return;
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/erp/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, status: order.status }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o pedido.');
      const { order: updated } = data;
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(updated);
    } catch (error) {
      setActionError(error.message || 'Não foi possível atualizar o pedido.');
    } finally {
      setBusy(false);
    }
  };

  const updateRefundRequest = async (refundRequest, action) => {
    setRefundBusyId(refundRequest.id);
    setRefundActionError('');
    setRefundActionNotice('');
    try {
      const response = await fetch(`/api/erp/refunds/${encodeURIComponent(refundRequest.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: refundDecisionNotes[refundRequest.id] || '',
        }),
      });
      const data = await response.json();
      const replaceRequest = (order) => ({
        ...order,
        refundRequests: (order.refundRequests || []).map((item) => item.id === data.request.id ? data.request : item),
      });
      if (data.request) {
        setOrders((current) => current.map((order) => order.id === selected?.id ? replaceRequest(order) : order));
        setSelected((current) => current?.id === selected?.id ? replaceRequest(current) : current);
      }
      if (!response.ok || data.error) throw new Error(data.error || 'Não foi possível atualizar a solicitação.');
      setRefundDecisionNotes((current) => ({ ...current, [refundRequest.id]: '' }));
      setRefundActionNotice(data.message || 'Solicitação atualizada.');
    } catch (error) {
      setRefundActionError(error.message || 'Não foi possível atualizar a solicitação.');
    } finally {
      setRefundBusyId('');
    }
  };

  const submitInternalRefund = async (event) => {
    event.preventDefault();
    if (!selected) return;
    setInternalRefundBusy(true);
    setRefundActionError('');
    setRefundActionNotice('');
    try {
      const response = await fetch(`/api/erp/orders/${encodeURIComponent(selected.id)}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(internalRefundAmount), reason: internalRefundReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o estorno parcial.');
      const updateOrder = (order) => ({
        ...order,
        refundRequests: [data.request, ...(order.refundRequests || [])],
      });
      setOrders((current) => current.map((order) => order.id === selected.id ? updateOrder(order) : order));
      setSelected((current) => current?.id === selected.id ? updateOrder(current) : current);
      setInternalRefundAmount('');
      setInternalRefundReason('');
      setRefundActionNotice(data.message || 'Estorno parcial registrado para análise.');
    } catch (error) {
      setRefundActionError(error.message || 'Não foi possível registrar o estorno parcial.');
    } finally {
      setInternalRefundBusy(false);
    }
  };

  const filteredOrders = useMemo(() => sortOrdersNewestFirst(orders.filter((order) => {
    const refundRequests = order.refundRequests || [];
    const text = `${order.id || ''} ${order.customerName || ''} ${order.customerEmail || ''} ${refundRequests.map((request) => request.code).join(' ')}`.toLowerCase();
    const cpfRequestMatches = cpfRequestFilter === 'all'
      || (cpfRequestFilter === 'requested' && order.includeCpfOnReceipt === true)
      || (cpfRequestFilter === 'not-requested' && order.includeCpfOnReceipt === false)
      || (cpfRequestFilter === 'unknown' && (order.includeCpfOnReceipt === null || order.includeCpfOnReceipt === undefined));
    const waitingGatewayStatuses = [
      refundRequestStatus.approvedWaitingGateway,
      refundRequestStatus.gatewayProcessing,
      refundRequestStatus.gatewayFailed,
    ];
    const refundRequestMatches = refundFilter === 'all'
      || (refundFilter === 'with-requests' && refundRequests.length > 0)
      || (refundFilter === 'awaiting-review' && refundRequests.some((request) => request.status === refundRequestStatus.requested))
      || (refundFilter === 'waiting-gateway' && refundRequests.some((request) => waitingGatewayStatuses.includes(request.status)));
    return text.includes(query.toLowerCase())
      && (status === 'Todos' || order.status === status)
      && cpfRequestMatches
      && refundRequestMatches;
  })), [cpfRequestFilter, orders, query, refundFilter, status]);

  const metrics = [
    ['Pedidos recebidos', orders.filter((order) => order.status === 'Recebido').length, ClipboardList],
    ['Em separacao', orders.filter((order) => order.status === 'Separacao').length, PackageCheck],
    ['Em expedicao', orders.filter((order) => order.status === 'Expedicao').length, Truck],
    ['Em transito', orders.filter((order) => order.status === 'Em transito').length, Clock3],
    ['Concluido', orders.filter((order) => order.status === 'Concluido').length, CheckCircle2],
    ['CPF solicitado', orders.filter((order) => order.includeCpfOnReceipt === true).length, FileText],
  ];
  const refundRequests = orders.flatMap((order) => order.refundRequests || []);
  const refundsAwaitingReview = refundRequests.filter((request) => request.status === refundRequestStatus.requested).length;
  const refundsWaitingGateway = refundRequests.filter((request) => [
    refundRequestStatus.approvedWaitingGateway,
    refundRequestStatus.gatewayProcessing,
    refundRequestStatus.gatewayFailed,
  ].includes(request.status)).length;

  return (
    <div className="erp-orders-page">
      <div className="erp-customer-header">
        <div>
          <span className="eyebrow">Operacao logistica</span>
          <h1>Pedidos</h1>
          <p>Pedidos, comprovantes internos, listas de separação e acompanhamento de solicitações de estorno.</p>
        </div>
      </div>
      <div className="erp-receipt-integration-note" role="note">
        <FileText size={18} aria-hidden="true" />
        <span><strong>Comprovantes e situação fiscal</strong><span>O código PED do pedido identifica o comprovante interno e serve para localizar solicitações de estorno. Este sistema ainda não registra número/série, chave, protocolo, QR Code ou tributos de uma NFC-e autorizada. A forma de pagamento é apenas a informada no pedido; não há confirmação de valor recebido.</span></span>
      </div>
      {loadError && <p className="erp-budget-warning" role="alert">{loadError}<button type="button" onClick={() => setReloadToken((value) => value + 1)}>Tentar novamente</button></p>}
      {ordersLoaded && <div className="erp-customer-metrics">
        {metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}
      </div>}
      <section className="erp-refund-overview" aria-label="Resumo das solicitações de estorno">
        <div><span>Solicitações aguardando análise</span><strong>{refundsAwaitingReview}</strong></div>
        <div><span>Aprovadas, aguardando integração</span><strong>{refundsWaitingGateway}</strong></div>
        <p>O ERP registra pedidos e decisões. Não executa nem confirma devolução financeira antes da integração da gateway.</p>
      </section>
      {newOrders.length > 0 && <section className="erp-new-orders-alert">
        <div><strong>Novos pedidos aguardando atenção</strong><span>{newOrders.length} pedido(s) recebido(s) aguardando conferência e separação.</span></div>
        <div className="erp-new-order-list">
          {newOrders.map((order) => <div className="erp-new-order-item" key={order.id}>
            <span><b>{order.id}</b> · {order.customerName || order.customerEmail}</span>
            <button type="button" onClick={() => { setStatus('Recebido'); setQuery(order.id); }}>Ver separação</button>
            <button type="button" className="erp-ack-button" onClick={() => acknowledge(order.id)}>Ciente</button>
          </div>)}
        </div>
      </section>}
      <div className="erp-customer-toolbar">
        <div className="erp-customer-search"><Search size={16} /><input placeholder="Buscar pedido, cliente ou código EST-" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label="Filtrar pedidos por situação" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filtrar pedidos por solicitação de CPF" value={cpfRequestFilter} onChange={(event) => setCpfRequestFilter(event.target.value)}>
          <option value="all">Todos os pedidos · CPF</option>
          <option value="requested">CPF solicitado</option>
          <option value="not-requested">Sem CPF solicitado</option>
          <option value="unknown">Solicitação não informada</option>
        </select>
        <select aria-label="Filtrar pedidos por solicitações de estorno" value={refundFilter} onChange={(event) => setRefundFilter(event.target.value)}>
          <option value="all">Todos os pedidos · estornos</option>
          <option value="with-requests">Com solicitações</option>
          <option value="awaiting-review">Aguardando análise</option>
          <option value="waiting-gateway">Aguardando gateway</option>
        </select>
      </div>
      <div className="erp-order-workspace">
        <section className="erp-customer-table-card">
          <div className="erp-table-heading">
            <div><h3>Fila operacional</h3><p>{loading ? 'Carregando pedidos reais...' : `${filteredOrders.length} pedidos encontrados`}</p></div>
          </div>
          {filteredOrders.length
            ? <div className="erp-table-scroll"><table className="erp-table">
              <thead><tr><th>Código interno</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>CPF solicitado</th><th>Estornos</th><th>Status</th></tr></thead>
              <tbody>{filteredOrders.map((order) => <tr key={order.id} className={selected?.id === order.id ? 'selected-row' : ''} onClick={() => { setSelected(order); setActionError(''); setRefundActionError(''); setRefundActionNotice(''); }}>
                <td><strong>{order.id}</strong><small>{order.address || 'Endereço não informado'}</small></td>
                <td>{order.customerName || order.customerEmail || 'Cliente não identificado'}</td>
                <td>{order.createdAt || 'Data não informada'}</td>
                <td>{order.items?.length || 0}</td>
                <td>{order.total || 'R$ 0,00'}</td>
                <td>{order.includeCpfOnReceipt === true ? <span className="erp-invoice-cpf-requested">Sim</span> : order.includeCpfOnReceipt === false ? 'Não' : '—'}</td>
                <td>{order.refundRequests?.length ? <span className="erp-refund-count">{order.refundRequests.length} · {order.refundRequests.filter((request) => request.status === refundRequestStatus.requested).length} pendente(s)</span> : '—'}</td>
                <td><span className="erp-status">{order.status || 'Recebido'}</span><small>{paymentStatusLabels[order.paymentStatus] || 'Pagamento não informado'}</small></td>
              </tr>)}</tbody>
            </table></div>
            : <div className="erp-empty-data">{loading ? 'Carregando pedidos reais...' : loadError ? 'Não foi possível carregar a fila de pedidos.' : 'Nenhum pedido registrado ainda. Os pedidos aparecerão aqui quando uma compra real for finalizada.'}</div>}
        </section>
        {selected && <aside className="erp-order-detail">
          <div className="erp-panel-title"><ShoppingBag size={17} /><div><h3>{selected.id}</h3><p>{selected.status}</p></div></div>
          <p className="erp-order-tracking-code">Código interno de rastreio e referência para estorno</p>
          <div className="erp-order-customer"><UserRound size={15} /><strong>{selected.customerName || 'Cliente não identificado'}</strong><span>{selected.customerEmail}</span></div>
          <div className="erp-order-address"><MapPin size={15} /><span>{selected.address || 'Endereço não informado'}</span></div>
          <div className="erp-order-address"><CreditCard size={15} /><span>Forma: {paymentLabels[selected.paymentMethod] || 'Não informada'} · Pagamento: <strong>{paymentStatusLabels[selected.paymentStatus] || 'Não informado'}</strong></span></div>
          {selected.paymentStatus === 'pending' && <p className="erp-order-fefo-note" role="status">A separação está bloqueada até a confirmação do pagamento pela Pagar.me.</p>}
          <div className="erp-order-address erp-order-invoice-cpf">
            <FileText size={15} />
            <span>
              CPF solicitado para documento fiscal: <strong>{selected.includeCpfOnReceipt === true ? 'Sim' : selected.includeCpfOnReceipt === false ? 'Não' : 'Não informado (pedido antigo)'}</strong>
              {selected.includeCpfOnReceipt === true && (formatInvoiceCpf(selected.invoiceCpf)
                ? <small>CPF: {formatInvoiceCpf(selected.invoiceCpf)}</small>
                : <small>CPF não registrado neste pedido.</small>)}
            </span>
          </div>
          <div className="erp-order-fiscal-control">
            <span className="erp-order-fiscal-state">Sem registro de autorização fiscal</span>
            <strong>Documento fiscal oficial (NFC-e/NF-e)</strong>
            <p>Número, série, chave de 44 dígitos, protocolo, QR Code, tributos aproximados e XML só poderão ser exibidos após uma emissão fiscal autorizada e integrada.</p>
          </div>
          <div className="erp-order-document-actions" aria-label="Impressões do pedido">
            <button type="button" className="secondary-cta erp-order-receipt-button" aria-haspopup="dialog" onClick={() => setPrintDocument({ type: 'receipt', order: selected })}>
              <FileText size={16} aria-hidden="true" />Comprovante do pedido (não fiscal)
            </button>
            <button type="button" className="secondary-cta erp-order-picking-button" aria-haspopup="dialog" onClick={() => setPrintDocument({ type: 'picking-list', order: selected })}>
              <ClipboardList size={16} aria-hidden="true" />Imprimir lista de separação
            </button>
          </div>
          <section className="erp-refund-list" aria-labelledby="erp-refund-list-title">
            <div className="erp-refund-list-heading"><h4 id="erp-refund-list-title">Rastreio de estornos</h4><span>{selected.refundRequests?.length || 0}</span></div>
            <p>Solicitações parciais e totais ficam vinculadas ao código PED. Pedidos pagos pela Pagar.me podem ser estornados por aqui; outros métodos permanecem para tratamento manual.</p>
            <p className="erp-refund-available">Saldo ainda disponível para novas solicitações: <strong>{currencyFormatter.format(getRemainingRefundCents(selected.total, selected.refundRequests || [], selected.refundedAmount) / 100)}</strong></p>
            {!selected.refundRequests?.length && <div className="erp-refund-empty">Nenhuma solicitação de estorno vinculada a este pedido.</div>}
            {(selected.refundRequests || []).map((request) => <article className="erp-refund-card" key={request.id}>
              <div className="erp-refund-card-heading">
                <strong>{request.code}</strong>
                <span className={`erp-refund-status ${request.status}`}>{refundRequestStatusLabels[request.status] || request.status}</span>
              </div>
              <dl>
                <div><dt>Valor solicitado</dt><dd>{currencyFormatter.format(request.amount)}</dd></div>
                <div><dt>Data</dt><dd>{formatDateTime(request.createdAtIso || request.createdAt)}</dd></div>
                <div><dt>Solicitante</dt><dd>{request.requestedBy || 'Cliente'}</dd></div>
              </dl>
              <p className="erp-refund-reason"><strong>Motivo:</strong> {request.reason}</p>
              {!!request.decisionNote && <p className="erp-refund-reason"><strong>Decisão:</strong> {request.decisionNote}</p>}
              {!!request.events?.length && <ol className="erp-refund-events">
                {request.events.map((event) => <li key={event.id}>
                  <span>{formatDateTime(event.createdAtIso || event.createdAt)}</span>
                  <strong>{event.actor}</strong>
                  {event.note && <small>{event.note}</small>}
                </li>)}
              </ol>}
              {[refundRequestStatus.requested, refundRequestStatus.gatewayFailed].includes(request.status) && <div className="erp-refund-review">
                <label htmlFor={`refund-note-${request.id}`}>Observação da decisão</label>
                <textarea id={`refund-note-${request.id}`} maxLength={500} value={refundDecisionNotes[request.id] || ''} onChange={(event) => setRefundDecisionNotes((current) => ({ ...current, [request.id]: event.target.value }))} />
                <div>
                  <button type="button" disabled={refundBusyId === request.id} onClick={() => updateRefundRequest(request, 'approve')}>
                    <RotateCcw size={14} />{request.status === refundRequestStatus.gatewayFailed
                      ? 'Tentar estorno novamente'
                      : selected.pagarmeChargeId && ['paid', 'partially_refunded'].includes(selected.paymentStatus)
                        ? 'Aprovar e estornar via Pagar.me'
                        : 'Aprovar · encaminhar estorno manual'}
                  </button>
                  {request.status === refundRequestStatus.requested && <button type="button" disabled={refundBusyId === request.id || (refundDecisionNotes[request.id] || '').trim().length < 8} onClick={() => updateRefundRequest(request, 'reject')}>Recusar</button>}
                </div>
              </div>}
            </article>)}
            {refundActionError && <p className="erp-order-action-error" role="alert"><AlertCircle size={16} />{refundActionError}</p>}
            {refundActionNotice && <p className="erp-refund-action-notice" role="status">{refundActionNotice}</p>}
          </section>
          {selected.pagarmeChargeId && ['paid', 'partially_refunded'].includes(selected.paymentStatus) && <form className="erp-refund-create-form" onSubmit={submitInternalRefund}>
            <h4>Devolver diferença ao cliente</h4>
            <p>Use para ajustar peso real inferior ao previsto ou item indisponível. O registro não envia dinheiro automaticamente: após revisar, confirme o estorno na solicitação acima.</p>
            <p className="erp-refund-available">Saldo disponível: <strong>{currencyFormatter.format(getRemainingRefundCents(selected.total, selected.refundRequests || [], selected.refundedAmount) / 100)}</strong></p>
            <label htmlFor="erp-internal-refund-amount">Valor a devolver (R$)</label>
            <input
              id="erp-internal-refund-amount"
              type="number"
              min="0.01"
              max={(getRemainingRefundCents(selected.total, selected.refundRequests || [], selected.refundedAmount) / 100).toFixed(2)}
              step="0.01"
              inputMode="decimal"
              required
              value={internalRefundAmount}
              onChange={(event) => setInternalRefundAmount(event.target.value)}
            />
            <label htmlFor="erp-internal-refund-reason">Motivo</label>
            <textarea
              id="erp-internal-refund-reason"
              minLength={8}
              maxLength={500}
              required
              value={internalRefundReason}
              onChange={(event) => setInternalRefundReason(event.target.value)}
            />
            <button type="submit" disabled={internalRefundBusy || getRemainingRefundCents(selected.total, selected.refundRequests || [], selected.refundedAmount) <= 0}>
              {internalRefundBusy ? 'Registrando...' : 'Registrar estorno parcial'}
            </button>
          </form>}
          <h4>Itens comprados</h4>
          <div className="erp-order-items">{(selected.items || []).map((item) => <div key={item.id || item.name}><strong>{item.name}<small>Código: {item.productCode || 'não registrado'}</small></strong><span>Qtd. {formatCartQuantity(item)} · {item.price}</span></div>)}</div>
          {selected.status === 'Recebido' && <p className="erp-order-fefo-note"><PackageCheck size={15} /> Ao iniciar a separação, o sistema reserva primeiro os lotes com validade mais próxima.</p>}
          {actionError && <p className="erp-order-action-error" role="alert"><AlertCircle size={16} />{actionError}</p>}
          <button type="button" className="primary-cta erp-advance-button" disabled={busy || !['Recebido', 'Separacao', 'Expedicao', 'Em transito'].includes(selected.status)} onClick={() => advanceOrder(selected)}>
            {selected.status === 'Recebido' ? 'Aceitar e enviar para separação' : selected.status === 'Separacao' ? 'Prosseguir para expedição' : selected.status === 'Expedicao' ? 'Confirmar envio à transportadora' : selected.status === 'Em transito' ? 'Confirmar entrega concluída' : 'Entrega concluída'}
          </button>
        </aside>}
      </div>
      <dialog
        ref={printDialogRef}
        className={`order-receipt-dialog erp-order-receipt-dialog${isPickingList ? ' order-picking-dialog' : ''}`}
        aria-labelledby={isPickingList ? 'order-picking-list-title' : 'order-receipt-title'}
        aria-describedby={isPickingList ? 'order-picking-list-description' : 'order-receipt-disclaimer'}
        onClose={() => setPrintDocument(null)}
        onClick={(event) => { if (event.target === printDialogRef.current) event.currentTarget.close(); }}
      >
        {printDocument && <div className="order-receipt-dialog-inner">
          <div className="order-receipt-actions">
            <button type="button" className="order-receipt-print" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />{isPickingList ? 'Imprimir lista' : 'Imprimir ou salvar em PDF'}</button>
            <button type="button" className="order-receipt-close" autoFocus onClick={() => printDialogRef.current?.close()}><X size={16} aria-hidden="true" />Fechar</button>
          </div>
          {isPickingList
            ? <OrderPickingList order={printDocument.order} />
            : <OrderReceipt order={printDocument.order} />}
        </div>}
      </dialog>
    </div>
  );
}
