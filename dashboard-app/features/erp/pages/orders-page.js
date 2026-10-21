'use client';

import { AlertCircle, Ban, CheckCircle2, ClipboardList, Clock3, CreditCard, FileText, MapPin, PackageCheck, Printer, RotateCcw, Search, ShoppingBag, Truck, UserRound, X, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import OrderReceipt from '@/features/orders/order-receipt';
import OrderPickingList from '@/features/orders/order-picking-list';
import {
  getConfirmedRefundType,
  getRemainingRefundCents,
  refundRequestStatus,
  refundRequestStatusLabels,
} from '@/features/orders/order-refund-utils';

const statuses = ['Todos', 'Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido', 'Cancelado'];
const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartão',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  vale_alimentacao: 'Vale-alimentação',
  vale_refeicao: 'Vale-refeição',
  dinheiro: 'Dinheiro',
  outro: 'Outro / combinar',
};
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
  const [refundSyncWarning, setRefundSyncWarning] = useState(false);
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
  const [blingBusy, setBlingBusy] = useState(false);
  const [blingError, setBlingError] = useState('');
  const [blingNotice, setBlingNotice] = useState('');
  const [nfceBusy, setNfceBusy] = useState(false);
  const [nfceError, setNfceError] = useState('');
  const [nfceNotice, setNfceNotice] = useState('');

  useEffect(() => {
    let active = true;
    const loadOrders = async () => {
      let syncWarning = false;
      try {
        const syncResponse = await fetch('/api/erp/refunds/reconcile', { method: 'POST', cache: 'no-store' });
        const syncData = await syncResponse.json();
        syncWarning = !syncResponse.ok || syncData.warning === true;
      } catch {
        syncWarning = true;
      }
      try {
        const response = await fetch('/api/erp/orders', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os pedidos.');
        if (!Array.isArray(data.orders)) throw new Error('A resposta de pedidos está inválida.');
        if (active) {
          setOrders(data.orders);
          setSelected((current) => current
            ? data.orders.find((order) => order.id === current.id) || current
            : current);
          setOrdersLoaded(true);
          setLoadError('');
          setRefundSyncWarning(syncWarning);
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Não foi possível carregar os pedidos.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadOrders();
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
    setBlingError('');
    setBlingNotice('');
    setNfceError('');
    setNfceNotice('');
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
      const withBlingFields = (item) => ({
        ...updated,
        blingSalesOrderId: item.blingSalesOrderId,
        blingSalesOrderNumber: item.blingSalesOrderNumber,
        blingSyncedAt: item.blingSyncedAt,
        blingSyncStatus: item.blingSyncStatus,
        blingSyncError: item.blingSyncError,
        blingSyncStartedAt: item.blingSyncStartedAt,
      });
      setOrders((current) => current.map((item) => item.id === updated.id ? withBlingFields(item) : item));
      setSelected((current) => current?.id === updated.id ? withBlingFields(current) : current);
      window.dispatchEvent(new Event('erp-orders-updated'));
    } catch (error) {
      setActionError(error.message || 'Não foi possível atualizar o pedido.');
    } finally {
      setBusy(false);
    }
  };

  const sendOrderToBling = async (order) => {
    const uncertain = order.blingSyncStatus === 'uncertain';
    const confirmation = uncertain
      ? `Antes de continuar, confira no Bling se existe um pedido com a referência HOJE-${order.id}.\n\nSó confirme se verificou que ele NÃO existe. Um pedido criado anteriormente pode resultar em duplicidade.\n\nVocê verificou e deseja tentar de novo?`
      : `Este envio transmitirá nome/e-mail, endereço de entrega, produtos, quantidades e valores ao Bling. O CPF só será incluído se foi solicitado para o documento fiscal do pedido.\n\nSerá criado apenas um pedido de venda; nenhuma NF-e será emitida. Deseja continuar?`;
    if (!window.confirm(confirmation)) return;

    setBlingBusy(true);
    setBlingError('');
    setBlingNotice('');
    try {
      const response = await fetch(`/api/erp/bling/orders/${encodeURIComponent(order.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmNoOrderFound: uncertain }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o pedido ao Bling.');
      const update = (current) => ({
        ...current,
        blingSalesOrderId: data.order.blingSalesOrderId,
        blingSalesOrderNumber: data.order.blingSalesOrderNumber,
        blingSyncedAt: data.order.blingSyncedAt,
        blingSyncStatus: 'sent',
        blingSyncError: null,
        blingSyncStartedAt: null,
      });
      setOrders((current) => current.map((item) => item.id === order.id ? update(item) : item));
      setSelected((current) => current?.id === order.id ? update(current) : current);
      setBlingNotice(data.message || 'Pedido de venda criado no Bling.');
      window.dispatchEvent(new Event('erp-orders-updated'));
    } catch (error) {
      setBlingError(error.message || 'Não foi possível enviar o pedido ao Bling.');
      setReloadToken((value) => value + 1);
    } finally {
      setBlingBusy(false);
    }
  };

  const updateNfce = async (order, action) => {
    const uncertainWithoutId = order.blingNfceStatus === 'uncertain' && !order.blingNfceId;
    const needsConfirmation = action !== 'refresh';
    const confirmation = uncertainWithoutId
      ? `Confira no Bling se existe um pedido ou uma NFC-e para a referência HOJE-${order.id}.\n\nSó continue se verificou que não existe nenhum. Uma emissão anterior pode gerar uma nota duplicada.\n\nDeseja tentar novamente?`
      : action === 'issue'
        ? 'O pagamento online foi confirmado. O sistema criará e enviará a NFC-e ao Bling para autorização da SEFAZ. Deseja iniciar agora?'
        : 'Deseja tentar novamente a emissão da NFC-e? Confira primeiro se a configuração fiscal ou os dados foram corrigidos no Bling.';
    if (needsConfirmation && !window.confirm(confirmation)) return;

    setNfceBusy(true);
    setNfceError('');
    setNfceNotice('');
    try {
      const response = await fetch(`/api/erp/bling/nfce/${encodeURIComponent(order.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          confirmNoInvoiceFound: uncertainWithoutId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a NFC-e.');
      if (data.invoice) {
        const update = (current) => ({
          ...current,
          ...data.invoice,
          blingNfceAuthorizedAt: data.invoice.blingNfceAuthorizedAt,
        });
        setOrders((current) => current.map((item) => item.id === order.id ? update(item) : item));
        setSelected((current) => current?.id === order.id ? update(current) : current);
      } else {
        setReloadToken((value) => value + 1);
      }
      setNfceNotice(data.message || 'Status da NFC-e atualizado.');
    } catch (error) {
      setNfceError(error.message || 'Não foi possível atualizar a NFC-e.');
      setReloadToken((value) => value + 1);
    } finally {
      setNfceBusy(false);
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
        window.dispatchEvent(new Event('erp-customer-actions-updated'));
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
      window.dispatchEvent(new Event('erp-customer-actions-updated'));
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
      || (refundFilter === 'waiting-gateway' && refundRequests.some((request) => waitingGatewayStatuses.includes(request.status)))
      || (refundFilter === 'full-refunded' && getConfirmedRefundType(order) === 'full')
      || (refundFilter === 'partial-refunded' && getConfirmedRefundType(order) === 'partial');
    return text.includes(query.toLowerCase())
      && (status === 'Todos' || order.status === status)
      && cpfRequestMatches
      && refundRequestMatches;
  })), [cpfRequestFilter, orders, query, refundFilter, status]);

  const metrics = [
    { label: 'Pedidos recebidos', value: orders.filter((order) => order.status === 'Recebido').length, Icon: ClipboardList, status: 'Recebido' },
    { label: 'Em separacao', value: orders.filter((order) => order.status === 'Separacao').length, Icon: PackageCheck, status: 'Separacao' },
    { label: 'Em expedicao', value: orders.filter((order) => order.status === 'Expedicao').length, Icon: Truck, status: 'Expedicao' },
    { label: 'Em transito', value: orders.filter((order) => order.status === 'Em transito').length, Icon: Clock3, status: 'Em transito' },
    { label: 'Concluido', value: orders.filter((order) => order.status === 'Concluido').length, Icon: CheckCircle2, status: 'Concluido' },
    { label: 'Cancelados', value: orders.filter((order) => order.status === 'Cancelado').length, Icon: Ban, status: 'Cancelado' },
    { label: 'Estorno total (100%)', value: orders.filter((order) => getConfirmedRefundType(order) === 'full').length, Icon: RotateCcw, refundFilter: 'full-refunded' },
    { label: 'Estorno parcial', value: orders.filter((order) => getConfirmedRefundType(order) === 'partial').length, Icon: RotateCcw, refundFilter: 'partial-refunded' },
    { label: 'CPF solicitado', value: orders.filter((order) => order.includeCpfOnReceipt === true).length, Icon: FileText, cpfRequestFilter: 'requested' },
  ];
  const selectMetric = (metric) => {
    setStatus(metric.status || 'Todos');
    setCpfRequestFilter(metric.cpfRequestFilter || 'all');
    setRefundFilter(metric.refundFilter || 'all');
    setQuery('');
  };
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
        <span><strong>NFC-e automática</strong><span>Quando a Pagar.me confirma o pagamento online, o sistema envia o pedido ao Bling e solicita a emissão da NFC-e. A autorização depende da SEFAZ e da configuração fiscal no Bling; confira o status e eventuais rejeições no detalhe do pedido.</span></span>
      </div>
      {loadError && <p className="erp-budget-warning" role="alert">{loadError}<button type="button" onClick={() => setReloadToken((value) => value + 1)}>Tentar novamente</button></p>}
      {refundSyncWarning && <p className="erp-budget-warning" role="status">Alguns estornos não puderam ser confirmados agora. Os indicadores podem estar desatualizados; atualize a página para tentar novamente.</p>}
      {ordersLoaded && <div className="erp-customer-metrics erp-order-metrics">
        {metrics.map((metric) => {
          const isActive = metric.status
            ? status === metric.status && cpfRequestFilter === 'all' && refundFilter === 'all' && !query
            : metric.refundFilter
              ? refundFilter === metric.refundFilter && status === 'Todos' && cpfRequestFilter === 'all' && !query
              : cpfRequestFilter === metric.cpfRequestFilter && status === 'Todos' && refundFilter === 'all' && !query;
          const Icon = metric.Icon;
          return <button
            type="button"
            className={`erp-customer-metric${metric.status === 'Cancelado' ? ' erp-order-metric-canceled' : ''}${metric.refundFilter ? ' erp-order-metric-refund' : ''}`}
            key={metric.label}
            aria-pressed={isActive}
            aria-label={`${metric.label}: ${metric.value}. Filtrar pedidos.`}
            onClick={() => selectMetric(metric)}
          >
            <Icon size={17} />
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </button>;
        })}
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
          <option value="full-refunded">Estorno total confirmado</option>
          <option value="partial-refunded">Estorno parcial confirmado</option>
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
            <span className="erp-order-fiscal-state">{selected.blingNfceStatus === 'authorized' ? 'NFC-e autorizada' : 'Aguardando autorização fiscal'}</span>
            <strong>Documento fiscal oficial (NFC-e)</strong>
            <p>{selected.blingNfceStatus === 'authorized'
              ? `Nota ${selected.blingNfceNumber || ''}${selected.blingNfceAccessKey ? ` · chave ${selected.blingNfceAccessKey}` : ''} · ${formatDateTime(selected.blingNfceAuthorizedAt)}.`
              : 'A situação fiscal será atualizada após retorno do Bling e da SEFAZ.'}</p>
          </div>
          <section className="erp-bling-order-panel" aria-labelledby="erp-bling-order-title">
            <div className="erp-bling-order-heading"><h4 id="erp-bling-order-title">Pedido no Bling</h4><span className={`erp-bling-order-status ${selected.blingSyncStatus || 'not_sent'}`}>
              {selected.blingSyncStatus === 'sent' ? 'Enviado' : selected.blingSyncStatus === 'sending' ? 'Enviando' : selected.blingSyncStatus === 'uncertain' ? 'Verificação necessária' : selected.blingSyncStatus === 'failed' ? 'Falha no envio' : 'Não enviado'}
            </span></div>
            {selected.blingSyncStatus === 'sent'
              ? <p>Pedido criado no Bling{selected.blingSalesOrderNumber ? ` · nº ${selected.blingSalesOrderNumber}` : ''} · ID {selected.blingSalesOrderId}. Enviado em {formatDateTime(selected.blingSyncedAt)}.</p>
              : selected.blingSyncStatus === 'sending'
                ? <p>Há uma tentativa de envio em andamento. Aguarde alguns minutos antes de verificar o estado.</p>
                : selected.blingSyncStatus === 'uncertain'
                  ? <p role="alert">O resultado da tentativa anterior não foi confirmado. Procure no Bling pela referência HOJE-{selected.id} antes de liberar outra tentativa.</p>
                  : <p>O certificado A1 permanece somente no Bling. Pedidos online pagos seguem para emissão automática da NFC-e após confirmação da Pagar.me.</p>}
            {selected.blingSyncError && selected.blingSyncStatus === 'failed' && <p className="erp-bling-order-error" role="alert">{selected.blingSyncError}</p>}
            {blingError && <p className="erp-bling-order-error" role="alert"><AlertCircle size={15} />{blingError}</p>}
            {blingNotice && <p className="erp-bling-order-notice" role="status"><CheckCircle2 size={15} />{blingNotice}</p>}
            {selected.blingSyncStatus !== 'sent' && selected.blingSyncStatus !== 'sending' && selected.paymentStatus !== 'pending' && !(selected.paymentStatus === 'paid' && selected.pagarmeOrderId) && selected.status !== 'Cancelado' && !['failed', 'canceled', 'partially_refunded', 'refunded'].includes(selected.paymentStatus) && <button
              type="button"
              className="secondary-cta erp-bling-send-button"
              disabled={blingBusy}
              onClick={() => void sendOrderToBling(selected)}
            >
              <Upload size={16} aria-hidden="true" />{blingBusy ? 'Enviando ao Bling...' : selected.blingSyncStatus === 'uncertain' ? 'Conferi no Bling; tentar novamente' : selected.blingSyncStatus === 'failed' ? 'Tentar enviar novamente' : 'Enviar pedido ao Bling'}
            </button>}
            {selected.paymentStatus === 'pending' && <p className="erp-order-fefo-note">O pedido só pode ser enviado após a confirmação do pagamento.</p>}
          </section>
          <section className="erp-nfce-order-panel" aria-labelledby="erp-nfce-order-title">
            <div className="erp-bling-order-heading"><h4 id="erp-nfce-order-title">NFC-e automática</h4><span className={`erp-bling-order-status ${selected.blingNfceStatus || 'not_issued'}`}>
              {selected.blingNfceStatus === 'authorized' ? 'Autorizada' : selected.blingNfceStatus === 'issuing' ? 'Emitindo' : selected.blingNfceStatus === 'processing' ? 'Processando' : selected.blingNfceStatus === 'uncertain' ? 'Verificação necessária' : selected.blingNfceStatus === 'failed' ? 'Rejeitada / falha' : 'Aguardando pagamento'}
            </span></div>
            {selected.blingNfceStatus === 'authorized'
              ? <p>NFC-e autorizada{selected.blingNfceNumber ? ` · nº ${selected.blingNfceNumber}` : ''}{selected.blingNfceAccessKey ? ` · chave ${selected.blingNfceAccessKey}` : ''} · {formatDateTime(selected.blingNfceAuthorizedAt)}.</p>
              : selected.blingNfceStatus === 'issuing'
                ? <p>A emissão foi iniciada após a confirmação do pagamento. Aguarde a resposta da SEFAZ.</p>
                : selected.blingNfceStatus === 'processing'
                  ? <p>O Bling ainda aguarda o processamento da SEFAZ. Atualize a situação antes de tentar novamente.</p>
                  : selected.blingNfceStatus === 'uncertain'
                    ? <p role="alert">Não foi possível confirmar o resultado. Confira a situação no Bling antes de qualquer nova tentativa.</p>
                    : selected.blingNfceStatus === 'failed'
                      ? <p role="alert">{selected.blingNfceError || 'A emissão falhou. Revise a configuração fiscal no Bling.'}</p>
                      : <p>A NFC-e será gerada e enviada para autorização após a confirmação do pagamento online pela Pagar.me.</p>}
            {nfceError && <p className="erp-bling-order-error" role="alert"><AlertCircle size={15} />{nfceError}</p>}
            {nfceNotice && <p className="erp-bling-order-notice" role="status"><CheckCircle2 size={15} />{nfceNotice}</p>}
            {selected.blingNfceStatus === 'authorized' && selected.blingNfcePdfUrl && <a className="erp-nfce-document-link" href={selected.blingNfcePdfUrl} target="_blank" rel="noreferrer">Abrir DANFE NFC-e</a>}
            {['processing', 'uncertain'].includes(selected.blingNfceStatus) && selected.blingNfceId && <button type="button" className="erp-bling-send-button" disabled={nfceBusy} onClick={() => void updateNfce(selected, 'refresh')}>{nfceBusy ? 'Consultando Bling...' : 'Atualizar situação da NFC-e'}</button>}
            {selected.blingNfceStatus === 'processing' && selected.paymentStatus === 'paid' && <button type="button" className="erp-bling-send-button" disabled={nfceBusy} onClick={() => void updateNfce(selected, 'retry')}>{nfceBusy ? 'Enviando para autorização...' : 'Revisei no Bling; tentar envio novamente'}</button>}
            {selected.paymentStatus === 'paid' && selected.pagarmeOrderId && !['authorized', 'issuing', 'processing'].includes(selected.blingNfceStatus) && <button type="button" className="erp-bling-send-button" disabled={nfceBusy} onClick={() => void updateNfce(selected, selected.blingNfceStatus === 'not_issued' ? 'issue' : 'retry')}>
              {nfceBusy ? 'Enviando para autorização...' : selected.blingNfceStatus === 'not_issued' ? 'Emitir NFC-e agora' : selected.blingNfceStatus === 'uncertain' ? 'Conferi no Bling; tentar novamente' : 'Tentar emitir NFC-e novamente'}
            </button>}
          </section>
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
        className={`order-receipt-dialog${isPickingList ? ' order-picking-dialog' : ''}`}
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
