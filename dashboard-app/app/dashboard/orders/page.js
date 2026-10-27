'use client';

import { Check, Copy, FileText, PackageOpen, Printer, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOrderStatus, orderStages } from '../order-status';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import OrderReceipt from '@/features/orders/order-receipt';
import { refundRequestStatusLabels } from '@/features/orders/order-refund-utils';
import { isCardPaymentMethod } from '@/features/payments/card-methods';
import {
  canRequestOrderService,
  hasOpenOrderServiceRequest,
  orderServiceRequestStatusLabels,
  orderServiceRequestType,
  orderServiceRequestTypeLabels,
} from '@/features/orders/order-service-request-utils';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const orderDateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
const paymentStatusLabels = {
  pending: 'Aguardando pagamento',
  paid: 'Pago',
  failed: 'Pagamento não aprovado',
  canceled: 'Pagamento cancelado',
  partially_refunded: 'Estorno parcial',
  refunded: 'Estornado',
  manual: 'Pagamento combinado com a loja',
};

const tabs = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Recebido', label: 'Recebido' },
  { value: 'Separacao', label: 'Em separação' },
  { value: 'Expedicao', label: 'Em expedição' },
  { value: 'Em transito', label: 'Em trânsito' },
  { value: 'Concluido', label: 'Entrega concluída' },
  { value: 'Cancelado', label: 'Cancelados' },
];

function getOrderActivitySummary(serviceRequests, refundRequests) {
  const serviceStatusLabels = {
    requested: 'solicitado',
    approved: 'aprovado',
    rejected: 'recusado',
  };
  const refundStatusLabels = {
    requested: 'solicitado',
    approved_waiting_gateway: 'aprovado',
    gateway_processing: 'em processamento',
    gateway_failed: 'requer atenção',
    rejected: 'recusado',
    completed: 'confirmado',
  };

  return [
    ...serviceRequests.map((request) => ({
      id: request.id,
      type: request.type === 'cancellation' ? 'cancellation' : 'service',
      label: `${request.type === 'cancellation' ? 'Cancelamento' : 'Troca'} ${serviceStatusLabels[request.status] || 'atualizado'}`,
    })),
    ...refundRequests.map((request) => ({
      id: request.id,
      type: 'refund',
      label: `Estorno ${refundStatusLabels[request.status] || 'atualizado'}`,
    })),
  ];
}

function formatOrderDate(order) {
  if (order.createdAtIso) {
    const date = new Date(order.createdAtIso);
    if (!Number.isNaN(date.getTime())) return orderDateFormatter.format(date);
  }
  return order.createdAt || 'Data não disponível';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('Todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refundSyncWarning, setRefundSyncWarning] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const receiptDialogRef = useRef(null);
  const [serviceRequestOrder, setServiceRequestOrder] = useState(null);
  const [serviceRequestType, setServiceRequestType] = useState('');
  const serviceRequestDialogRef = useRef(null);
  const [serviceRequestItemId, setServiceRequestItemId] = useState('');
  const [replacementProduct, setReplacementProduct] = useState('');
  const [serviceRequestReason, setServiceRequestReason] = useState('');
  const [serviceRequestBusy, setServiceRequestBusy] = useState(false);
  const [serviceRequestError, setServiceRequestError] = useState('');
  const [serviceRequestNotice, setServiceRequestNotice] = useState('');
  const [orderCopyFeedback, setOrderCopyFeedback] = useState({});
  const [copiedPixOrderId, setCopiedPixOrderId] = useState('');
  const [pixCopyError, setPixCopyError] = useState('');
  const [checkingPaymentOrderId, setCheckingPaymentOrderId] = useState('');
  const [paymentCheckFeedback, setPaymentCheckFeedback] = useState({});
  const paymentChecksInFlightRef = useRef(new Set());
  const paymentPollingInProgressRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadOrders = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        let syncWarning = false;
        try {
          const syncResponse = await fetch('/api/my/orders/refunds/reconcile', { method: 'POST', cache: 'no-store' });
          const syncData = await syncResponse.json();
          syncWarning = !syncResponse.ok || syncData.warning === true;
        } catch {
          syncWarning = true;
        }
        const response = await fetch('/api/my/orders', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus pedidos.');
        if (!Array.isArray(data.orders)) throw new Error('A resposta de pedidos está em um formato inválido.');
        if (active) {
          setOrders(data.orders);
          setLoadError('');
          setRefundSyncWarning(syncWarning);
        }
      } catch (error) {
        if (active) setLoadError(error.message || 'Não foi possível carregar seus pedidos.');
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadOrders(true);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadOrders();
    };
    const interval = window.setInterval(refreshWhenVisible, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [retryCount]);

  useEffect(() => {
    const dialog = receiptDialogRef.current;
    if (receiptOrder && dialog && !dialog.open) dialog.showModal();
  }, [receiptOrder]);

  useEffect(() => {
    const dialog = serviceRequestDialogRef.current;
    if (serviceRequestOrder && dialog && !dialog.open) dialog.showModal();
  }, [serviceRequestOrder]);

  const orderCounts = useMemo(() => orders.reduce((counts, order) => {
    counts.Todos += 1;
    counts[order.status] = (counts[order.status] || 0) + 1;
    return counts;
  }, Object.fromEntries(tabs.map(({ value }) => [value, 0]))), [orders]);
  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return sortOrdersNewestFirst(orders.filter((order) => (
      (activeTab === 'Todos' || order.status === activeTab)
      && (!normalizedSearch || String(order.id).toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    )));
  }, [activeTab, orders, searchTerm]);

  const retryLoading = () => {
    setLoadError('');
    setIsLoading(true);
    setRetryCount((count) => count + 1);
  };

  const copyPixCode = async (order) => {
    const pixCode = order.paymentDetails?.pixQrCode;
    if (!pixCode) return;
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopiedPixOrderId(order.id);
      setPixCopyError('');
    } catch (error) {
      console.error('Não foi possível copiar o código Pix:', error);
      setCopiedPixOrderId('');
      setPixCopyError('Não foi possível copiar automaticamente. Selecione e copie o código Pix abaixo.');
    }
  };

  const copyOrderId = async (order) => {
    try {
      await navigator.clipboard.writeText(String(order.id));
      setOrderCopyFeedback((current) => ({ ...current, [order.id]: { copied: true, error: '' } }));
    } catch (error) {
      console.error('Não foi possível copiar o código do pedido:', error);
      setOrderCopyFeedback((current) => ({
        ...current,
        [order.id]: { copied: false, error: 'Não foi possível copiar o código. Selecione-o manualmente.' },
      }));
    }
  };

  const verifyPayment = useCallback(async (order, { automatic = false } = {}) => {
    if (paymentChecksInFlightRef.current.has(order.id)) return null;
    paymentChecksInFlightRef.current.add(order.id);
    if (!automatic) {
      setCheckingPaymentOrderId(order.id);
      setPaymentCheckFeedback((current) => ({ ...current, [order.id]: null }));
    }
    try {
      const response = await fetch(`/api/my/orders/${encodeURIComponent(order.id)}/payment-status`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o pagamento agora.');
      if (!automatic || data.paymentStatus !== 'pending') {
        setPaymentCheckFeedback((current) => ({
          ...current,
          [order.id]: { message: data.message || 'Status do pagamento atualizado.', error: false },
        }));
        setRetryCount((count) => count + 1);
      }
      return data;
    } catch (error) {
      setPaymentCheckFeedback((current) => ({
        ...current,
        [order.id]: { message: error.message || 'Não foi possível consultar o pagamento agora.', error: true },
      }));
      return null;
    } finally {
      paymentChecksInFlightRef.current.delete(order.id);
      if (!automatic) setCheckingPaymentOrderId('');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const checkPendingPayments = async () => {
      if (!active || paymentPollingInProgressRef.current || document.visibilityState !== 'visible') return;
      const pendingOrders = orders.filter((order) => (
        order.paymentStatus === 'pending'
        && (order.paymentMethod === 'pix' || isCardPaymentMethod(order.paymentMethod))
        && order.pagarmeOrderId
      ));
      if (!pendingOrders.length) return;

      paymentPollingInProgressRef.current = true;
      try {
        for (const order of pendingOrders) {
          if (!active) return;
          await verifyPayment(order, { automatic: true });
        }
      } finally {
        paymentPollingInProgressRef.current = false;
      }
    };

    void checkPendingPayments();
    const interval = window.setInterval(checkPendingPayments, 15000);
    document.addEventListener('visibilitychange', checkPendingPayments);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', checkPendingPayments);
    };
  }, [orders, verifyPayment]);

  const openServiceRequestDialog = (order, type) => {
    setServiceRequestOrder(order);
    setServiceRequestType(type);
    setServiceRequestItemId(type === orderServiceRequestType.exchange ? order.items?.[0]?.id || '' : '');
    setReplacementProduct('');
    setServiceRequestReason('');
    setServiceRequestError('');
  };

  const submitServiceRequest = async (event) => {
    event.preventDefault();
    if (!serviceRequestOrder) return;
    setServiceRequestBusy(true);
    setServiceRequestError('');
    try {
      const response = await fetch(`/api/my/orders/${encodeURIComponent(serviceRequestOrder.id)}/service-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: serviceRequestType,
          reason: serviceRequestReason,
          ...(serviceRequestType === orderServiceRequestType.exchange
            ? { orderItemId: serviceRequestItemId, replacementProduct }
            : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o pedido.');
      setOrders((current) => current.map((order) => order.id === serviceRequestOrder.id
        ? { ...order, serviceRequests: [data.serviceRequest, ...(order.serviceRequests || [])] }
        : order));
      setServiceRequestNotice(`${data.message} Código ${data.serviceRequest.code}.`);
      serviceRequestDialogRef.current?.close();
    } catch (error) {
      setServiceRequestError(error.message || 'Não foi possível registrar o pedido.');
    } finally {
      setServiceRequestBusy(false);
    }
  };

  const emptyState = activeTab === 'Todos'
    ? (
      <>
        <p>Seus pedidos aparecerão aqui depois que você concluir uma compra.</p>
        <a href="/" className="primary-cta">Ir para a loja</a>
      </>
    )
    : (
      <>
        <p>Não há pedidos com o status “{tabs.find((tab) => tab.value === activeTab)?.label || activeTab}”.</p>
        <button type="button" className="secondary-cta" onClick={() => setActiveTab('Todos')}>Ver todos os pedidos</button>
      </>
    );
  return (
    <div className="section-shell orders-showcase">
      <header className="section-header orders-header">
        <div>
          <span className="orders-kicker">Central de acompanhamento</span>
          <h1>Meus pedidos</h1>
          <p>Acompanhe cada etapa da sua compra e consulte o comprovante informativo de cada pedido.</p>
        </div>
        <div className="orders-header-mark" aria-live="polite">
          <span className="orders-header-dot" />
          {isLoading ? 'Carregando pedidos' : loadError && !orders.length ? 'Pedidos indisponíveis' : `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`}
        </div>
      </header>

      <div className="customer-receipt-intro" role="note">
        <FileText size={17} aria-hidden="true" />
        <span>O comprovante informativo mostra os itens e o código interno do pedido. Quando a NFC-e for autorizada, o link para abrir o documento fiscal aparecerá junto ao pedido. Por aqui você pode solicitar cancelamento ou troca; estornos são analisados e processados pela loja.</span>
      </div>
      {refundSyncWarning && <div className="dashboard-data-alert" role="status">Não foi possível confirmar alguns estornos com a Pagar.me agora. O status pode estar temporariamente desatualizado; tente atualizar a página em instantes.</div>}
      {serviceRequestNotice && <div className="customer-service-notice" role="status">{serviceRequestNotice}</div>}

      <div className="orders-toolbar">
        <label className="orders-search">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar pelo número do pedido"
            aria-label="Buscar pedido pelo número"
          />
        </label>
        {searchTerm && <button type="button" className="orders-search-clear" aria-label="Limpar busca" onClick={() => setSearchTerm('')}>
          <X size={16} aria-hidden="true" />
        </button>}
      </div>

      <div className="tab-row order-status-tabs" role="group" aria-label="Filtrar pedidos por status">
        {tabs.map(({ value, label }) => {
          const info = value === 'Todos' ? null : getOrderStatus(value);
          return (
            <button
              key={value}
              type="button"
              className={`${activeTab === value ? 'active' : ''} ${info ? `status-filter-${info.tone}` : 'all-filter'}`}
              aria-pressed={activeTab === value}
              aria-label={`${label}, ${orderCounts[value]} ${orderCounts[value] === 1 ? 'pedido' : 'pedidos'}`}
              onClick={() => setActiveTab(value)}
            >
              {info && <span className="order-status-light" aria-hidden="true" />}
              {label}
              <span className="order-filter-count" aria-hidden="true">{orderCounts[value]}</span>
            </button>
          );
        })}
      </div>
      {!isLoading && !loadError && orders.length > 0 && <p className="orders-results-count" role="status" aria-live="polite">
        {filteredOrders.length === orders.length
          ? `${filteredOrders.length} ${filteredOrders.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}`
          : `Mostrando ${filteredOrders.length} de ${orders.length} pedidos`}
      </p>}

      {loadError && orders.length > 0 && (
        <div className="dashboard-data-alert" role="alert">
          <span>Não foi possível atualizar os pedidos: {loadError}</span>
          <button type="button" onClick={retryLoading}>Tentar novamente</button>
        </div>
      )}

      {isLoading ? (
        <div className="favorites-loading orders-loading" role="status">
          <span className="favorites-loading-indicator" />
          Carregando seus pedidos...
        </div>
      ) : loadError && !orders.length ? (
        <div className="empty-state orders-error-state" role="alert">
          <div className="empty-state-box"><PackageOpen size={38} /></div>
          <h3>Não foi possível carregar seus pedidos</h3>
          <p>Confira sua conexão e tente novamente. Seus dados não foram removidos.</p>
          <button type="button" className="primary-cta" onClick={retryLoading}>Tentar novamente</button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-box"><PackageOpen size={38} /></div>
          <h3>{orders.length === 0 ? 'Você ainda não tem pedidos' : searchTerm.trim() ? 'Nenhum pedido encontrado' : 'Nenhum pedido neste status'}</h3>
          {orders.length === 0
            ? emptyState
            : searchTerm.trim()
              ? <>
                <p>Não encontramos pedidos com o código “{searchTerm.trim()}”.</p>
                <button type="button" className="secondary-cta" onClick={() => { setSearchTerm(''); setActiveTab('Todos'); }}>Limpar busca e filtros</button>
              </>
              : emptyState}
        </div>
      ) : (
        <div className="orders-panel">
          <div className="orders-table" role="table" aria-label="Seus pedidos">
            <div className="table-head" role="row">
              <span role="columnheader">Pedido</span>
              <span role="columnheader">Status e andamento</span>
              <span role="columnheader">Itens</span>
              <span role="columnheader">Total</span>
            </div>
            {filteredOrders.map((order) => {
              const info = getOrderStatus(order.status);
              const currentStage = orderStages.indexOf(order.status);
              const itemCount = order.items?.length || 0;
              const refundRequests = order.refundRequests || [];
              const serviceRequests = order.serviceRequests || [];
              const orderActivity = getOrderActivitySummary(serviceRequests, refundRequests);
              return (
                <div key={order.id} className={`table-row${order.status === 'Cancelado' ? ' cancelled-order-row' : ''}`} role="row">
                  <span className="customer-order-reference" role="cell">
                    <span className="customer-order-reference-heading">
                      <strong title={order.id}>
                        <span aria-hidden="true">{order.id.length > 21 ? `${order.id.slice(0, 14)}…${order.id.slice(-5)}` : order.id}</span>
                        {order.id.length > 21 && <span className="sr-only">{order.id}</span>}
                      </strong>
                      <button
                        type="button"
                        className={`customer-order-copy-button${orderCopyFeedback[order.id]?.copied ? ' copied' : ''}`}
                        aria-label={orderCopyFeedback[order.id]?.copied ? `Código do pedido ${order.id} copiado` : `Copiar código completo do pedido ${order.id}`}
                        title={orderCopyFeedback[order.id]?.copied ? 'Código copiado' : 'Copiar código completo'}
                        onClick={() => copyOrderId(order)}
                      >
                        {orderCopyFeedback[order.id]?.copied
                          ? <><Check size={13} aria-hidden="true" /><span>Copiado</span></>
                          : <Copy size={14} aria-hidden="true" />}
                      </button>
                    </span>
                    {orderCopyFeedback[order.id]?.error && <small className="customer-order-copy-error" role="alert">{orderCopyFeedback[order.id].error}</small>}
                    <time className="customer-order-date" dateTime={order.createdAtIso || undefined}>
                      {formatOrderDate(order)}
                    </time>
                    <button type="button" className="customer-order-receipt-link" aria-label={`Ver comprovante informativo do pedido ${order.id}`} aria-haspopup="dialog" onClick={() => setReceiptOrder(order)}>
                      <FileText size={14} aria-hidden="true" />Comprovante
                    </button>
                    {order.fiscalInvoice && <div className="customer-order-nfce" role="status">
                      <strong>NFC-e autorizada{order.fiscalInvoice.number ? ` · nº ${order.fiscalInvoice.number}` : ''}</strong>
                      {order.fiscalInvoice.pdfUrl && <a href={order.fiscalInvoice.pdfUrl} target="_blank" rel="noreferrer">Abrir DANFE NFC-e</a>}
                      {order.fiscalInvoice.accessKey && <small>Chave de acesso: {order.fiscalInvoice.accessKey}</small>}
                    </div>}
                    <div className="customer-order-service-actions">
                      {canRequestOrderService(order, orderServiceRequestType.cancellation) && !hasOpenOrderServiceRequest(serviceRequests, orderServiceRequestType.cancellation) && <button type="button" onClick={() => openServiceRequestDialog(order, orderServiceRequestType.cancellation)}>Solicitar cancelamento</button>}
                      {canRequestOrderService(order, orderServiceRequestType.exchange) && order.items?.length > 0 && !hasOpenOrderServiceRequest(serviceRequests, orderServiceRequestType.exchange) && <button type="button" onClick={() => openServiceRequestDialog(order, orderServiceRequestType.exchange)}>Solicitar troca</button>}
                    </div>
                    {orderActivity.length > 0 && <div className="customer-order-activity">
                      <div className="customer-order-activity-badges" aria-label="Resumo de cancelamento e estorno">
                        {orderActivity.map((activity) => <span className={`customer-order-activity-badge ${activity.type}`} key={activity.id}>{activity.label}</span>)}
                      </div>
                      <details className="customer-order-activity-details">
                        <summary>Ver protocolos e detalhes</summary>
                        <div className="customer-order-activity-detail-list">
                          {serviceRequests.map((request) => <span className="customer-service-summary" key={request.id}>
                            <strong>{orderServiceRequestTypeLabels[request.type] || request.type} · {request.code}</strong>
                            <span>{orderServiceRequestStatusLabels[request.status] || request.status}</span>
                          </span>)}
                          {refundRequests.map((request) => <span className="customer-refund-summary" key={request.id}>
                            <strong>{request.code}</strong>
                            <span>{currencyFormatter.format(request.amount)} · {refundRequestStatusLabels[request.status] || request.status}</span>
                          </span>)}
                        </div>
                      </details>
                    </div>}
                    {order.paymentStatus === 'pending' && order.paymentMethod === 'pix' && order.paymentDetails?.pixQrCode && <span className="customer-pix-payment">
                      <strong>Pix aguardando pagamento</strong>
                      <small>A confirmação é verificada automaticamente enquanto esta tela estiver aberta.</small>
                      {order.paymentDetails.pixQrCodeUrl && <img src={order.paymentDetails.pixQrCodeUrl} alt={`QR Code Pix do pedido ${order.id}`} />}
                      <textarea aria-label={`Código Pix do pedido ${order.id}`} value={order.paymentDetails.pixQrCode} readOnly rows={3} />
                      <button type="button" onClick={() => copyPixCode(order)}>{copiedPixOrderId === order.id ? 'Código Pix copiado' : 'Copiar código Pix'}</button>
                      {order.paymentDetails.pixExpiresAt && <small>Válido até {new Date(order.paymentDetails.pixExpiresAt).toLocaleString('pt-BR')}</small>}
                      {pixCopyError && <small role="alert">{pixCopyError}</small>}
                      <button type="button" disabled={Boolean(checkingPaymentOrderId)} onClick={() => verifyPayment(order)}>
                        {checkingPaymentOrderId === order.id ? 'Consultando pagamento...' : 'Verificar pagamento'}
                      </button>
                      {paymentCheckFeedback[order.id] && <small role={paymentCheckFeedback[order.id].error ? 'alert' : 'status'}>{paymentCheckFeedback[order.id].message}</small>}
                    </span>}
                    {order.paymentStatus === 'pending' && (order.paymentMethod === 'pix' || isCardPaymentMethod(order.paymentMethod)) && !order.paymentDetails?.pixQrCode && <span className="customer-pix-payment" role="status">
                      <strong>Pagamento aguardando confirmação</strong>
                      <small>A confirmação é verificada automaticamente enquanto esta tela estiver aberta. Não tente pagar novamente.</small>
                      <button type="button" disabled={Boolean(checkingPaymentOrderId)} onClick={() => verifyPayment(order)}>
                        {checkingPaymentOrderId === order.id ? 'Consultando pagamento...' : 'Verificar pagamento'}
                      </button>
                      {paymentCheckFeedback[order.id] && <small role={paymentCheckFeedback[order.id].error ? 'alert' : 'status'}>{paymentCheckFeedback[order.id].message}</small>}
                    </span>}
                  </span>
                  <span className="order-status-cell" role="cell">
                    <span className={`status-badge ${info.tone}`}><span className="order-status-light" aria-hidden="true" />{info.label}</span>
                    {order.status !== 'Cancelado' && <span className="order-progress" role="group" aria-label={`Andamento do pedido ${order.id}: ${info.label}`}>
                      {orderStages.map((stage, index) => {
                        const stageInfo = getOrderStatus(stage);
                        return (
                          <button
                            key={stage}
                            type="button"
                            title={`Filtrar ${stageInfo.label}`}
                            aria-label={`Filtrar pedidos: ${stageInfo.label}`}
                            aria-pressed={activeTab === stage}
                            className={`order-progress-step ${index < currentStage ? 'done' : ''} ${index === currentStage ? 'current' : ''} ${stageInfo.tone}`}
                            onClick={() => setActiveTab(stage)}
                          >
                            <span className="order-status-light" aria-hidden="true" />
                            <span className="order-progress-label">{stageInfo.label}</span>
                          </button>
                        );
                      })}
                    </span>}
                  </span>
                  <span role="cell" data-label="Itens">{itemCount}</span>
                  <span role="cell" data-label="Total">{order.total || 'R$ 0,00'}<small className="customer-order-payment-status">Pagamento: {paymentStatusLabels[order.paymentStatus] || order.paymentStatus || 'Não informado'}</small></span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <dialog
        ref={receiptDialogRef}
        className="order-receipt-dialog"
        aria-labelledby="order-receipt-title"
        aria-describedby="order-receipt-disclaimer"
        onClose={() => setReceiptOrder(null)}
        onClick={(event) => { if (event.target === receiptDialogRef.current) event.currentTarget.close(); }}
      >
        {receiptOrder && <div className="order-receipt-dialog-inner">
          <div className="order-receipt-actions">
            <button type="button" className="order-receipt-print" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Imprimir ou salvar em PDF</button>
            <button type="button" className="order-receipt-close" autoFocus onClick={() => receiptDialogRef.current?.close()}><X size={16} aria-hidden="true" />Fechar</button>
          </div>
          <OrderReceipt order={receiptOrder} />
        </div>}
      </dialog>
      <dialog
        ref={serviceRequestDialogRef}
        className="order-service-request-dialog"
        aria-labelledby="service-request-title"
        aria-describedby="service-request-description"
        onClose={() => setServiceRequestOrder(null)}
        onClick={(event) => { if (event.target === serviceRequestDialogRef.current) event.currentTarget.close(); }}
      >
        {serviceRequestOrder && <form className="order-service-request-form" onSubmit={submitServiceRequest}>
          <header>
            <span className="orders-kicker">Atendimento da compra</span>
            <h2 id="service-request-title">{orderServiceRequestTypeLabels[serviceRequestType] || 'Solicitar atendimento'}</h2>
            <p id="service-request-description">Pedido {serviceRequestOrder.id}</p>
          </header>
          <div className="order-service-request-warning" role="note">
            A solicitação será analisada pela loja. O pedido só muda de status depois do atendimento no ERP.
          </div>
          {serviceRequestType === orderServiceRequestType.exchange && <>
            <label htmlFor="service-request-item">Item do pedido</label>
            <select id="service-request-item" required value={serviceRequestItemId} onChange={(event) => setServiceRequestItemId(event.target.value)}>
              {(serviceRequestOrder.items || []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <label htmlFor="service-request-replacement">Produto desejado</label>
            <input id="service-request-replacement" minLength={2} maxLength={160} required value={replacementProduct} onChange={(event) => setReplacementProduct(event.target.value)} />
          </>}
          <label htmlFor="service-request-reason">{serviceRequestType === orderServiceRequestType.exchange ? 'Motivo e detalhes da troca' : 'Motivo do cancelamento'}</label>
          <textarea id="service-request-reason" minLength={8} maxLength={500} required value={serviceRequestReason} onChange={(event) => setServiceRequestReason(event.target.value)} />
          {serviceRequestError && <p className="refund-request-error" role="alert">{serviceRequestError}</p>}
          <div className="refund-request-actions">
            <button type="button" className="secondary-cta" disabled={serviceRequestBusy} onClick={() => serviceRequestDialogRef.current?.close()}>Voltar</button>
            <button type="submit" className="primary-cta" disabled={serviceRequestBusy}>{serviceRequestBusy ? 'Enviando...' : 'Enviar solicitação'}</button>
          </div>
        </form>}
      </dialog>
    </div>
  );
}
