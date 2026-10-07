'use client';

import Link from 'next/link';
import { FileText, PackageOpen, Printer, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrderStatus, orderStages } from '../order-status';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import OrderReceipt from '@/features/orders/order-receipt';
import { getRemainingRefundCents, refundRequestStatusLabels } from '@/features/orders/order-refund-utils';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
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
];

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('Todos');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const receiptDialogRef = useRef(null);
  const [refundOrder, setRefundOrder] = useState(null);
  const refundDialogRef = useRef(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundNotice, setRefundNotice] = useState('');
  const [copiedPixOrderId, setCopiedPixOrderId] = useState('');
  const [pixCopyError, setPixCopyError] = useState('');
  const [checkingPaymentOrderId, setCheckingPaymentOrderId] = useState('');
  const [paymentCheckFeedback, setPaymentCheckFeedback] = useState({});

  useEffect(() => {
    let active = true;
    const loadOrders = async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      try {
        const response = await fetch('/api/my/orders', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar seus pedidos.');
        if (!Array.isArray(data.orders)) throw new Error('A resposta de pedidos está em um formato inválido.');
        if (active) {
          setOrders(data.orders);
          setLoadError('');
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
    const dialog = refundDialogRef.current;
    if (refundOrder && dialog && !dialog.open) dialog.showModal();
  }, [refundOrder]);

  const filteredOrders = useMemo(
    () => sortOrdersNewestFirst(activeTab === 'Todos' ? orders : orders.filter((order) => order.status === activeTab)),
    [activeTab, orders],
  );

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

  const verifyPayment = async (order) => {
    setCheckingPaymentOrderId(order.id);
    setPaymentCheckFeedback((current) => ({ ...current, [order.id]: null }));
    try {
      const response = await fetch(`/api/my/orders/${encodeURIComponent(order.id)}/payment-status`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o pagamento agora.');
      setPaymentCheckFeedback((current) => ({
        ...current,
        [order.id]: { message: data.message || 'Status do pagamento atualizado.', error: false },
      }));
      setRetryCount((count) => count + 1);
    } catch (error) {
      setPaymentCheckFeedback((current) => ({
        ...current,
        [order.id]: { message: error.message || 'Não foi possível consultar o pagamento agora.', error: true },
      }));
    } finally {
      setCheckingPaymentOrderId('');
    }
  };

  const openRefundDialog = (order) => {
    const availableCents = getRemainingRefundCents(order.total, order.refundRequests || []);
    setRefundOrder(order);
    setRefundAmount((availableCents / 100).toFixed(2));
    setRefundReason('');
    setRefundError('');
  };

  const submitRefundRequest = async (event) => {
    event.preventDefault();
    if (!refundOrder) return;
    setRefundBusy(true);
    setRefundError('');
    try {
      const response = await fetch(`/api/my/orders/${encodeURIComponent(refundOrder.id)}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(refundAmount), reason: refundReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar a solicitação.');
      setOrders((current) => current.map((order) => order.id === refundOrder.id
        ? { ...order, refundRequests: [data.request, ...(order.refundRequests || [])] }
        : order));
      setRefundNotice(`Solicitação ${data.request.code} registrada para o pedido ${refundOrder.id}. Nenhum valor foi estornado.`);
      refundDialogRef.current?.close();
    } catch (error) {
      setRefundError(error.message || 'Não foi possível registrar a solicitação.');
    } finally {
      setRefundBusy(false);
    }
  };

  const emptyState = activeTab === 'Todos'
    ? (
      <>
        <p>Seus pedidos aparecerão aqui depois que você concluir uma compra.</p>
        <Link href="/" className="primary-cta">Ir para a loja</Link>
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
        <span>O comprovante mostra os dados atuais do estabelecimento, itens e o código interno para localizar o pedido. Ele não substitui NFC-e/NF-e autorizada. Você pode registrar uma solicitação de estorno total ou parcial; o sistema não devolve dinheiro até haver integração de pagamento.</span>
      </div>
      {refundNotice && <div className="customer-refund-notice" role="status">{refundNotice}</div>}

      <div className="tab-row order-status-tabs" role="group" aria-label="Filtrar pedidos por status">
        {tabs.map(({ value, label }) => {
          const info = value === 'Todos' ? null : getOrderStatus(value);
          return (
            <button
              key={value}
              type="button"
              className={`${activeTab === value ? 'active' : ''} ${info ? `status-filter-${info.tone}` : 'all-filter'}`}
              aria-pressed={activeTab === value}
              onClick={() => setActiveTab(value)}
            >
              {info && <span className="order-status-light" aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>

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
          <h3>{activeTab === 'Todos' ? 'Você ainda não tem pedidos' : 'Nenhum pedido neste status'}</h3>
          {emptyState}
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
              const refundRequests = order.refundRequests || [];
              const remainingRefundCents = getRemainingRefundCents(order.total, refundRequests, order.refundedAmount);
              return (
                <div key={order.id} className="table-row" role="row">
                  <span className="customer-order-reference" role="cell">
                    <strong>{order.id}</strong>
                    <button type="button" className="customer-order-receipt-link" aria-label={`Ver comprovante informativo do pedido ${order.id}`} aria-haspopup="dialog" onClick={() => setReceiptOrder(order)}>
                      <FileText size={14} aria-hidden="true" />Ver comprovante
                    </button>
                    <button type="button" className="customer-order-refund-link" disabled={remainingRefundCents <= 0} aria-haspopup="dialog" onClick={() => openRefundDialog(order)}>
                      <RotateCcw size={14} aria-hidden="true" />{remainingRefundCents > 0 ? 'Solicitar estorno' : 'Limite solicitado'}
                    </button>
                    {refundRequests.map((request) => <span className="customer-refund-summary" key={request.id}>
                      <strong>{request.code}</strong>
                      <span>{currencyFormatter.format(request.amount)} · {refundRequestStatusLabels[request.status] || request.status}</span>
                    </span>)}
                    {order.paymentStatus === 'pending' && order.paymentMethod === 'pix' && order.paymentDetails?.pixQrCode && <span className="customer-pix-payment">
                      <strong>Pix aguardando pagamento</strong>
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
                    {order.paymentStatus === 'pending' && ['pix', 'cartao'].includes(order.paymentMethod) && !order.paymentDetails?.pixQrCode && <span className="customer-pix-payment" role="status">
                      <strong>Pagamento aguardando confirmação</strong>
                      <small>Confira o status antes de tentar pagar novamente.</small>
                      <button type="button" disabled={Boolean(checkingPaymentOrderId)} onClick={() => verifyPayment(order)}>
                        {checkingPaymentOrderId === order.id ? 'Consultando pagamento...' : 'Verificar pagamento'}
                      </button>
                      {paymentCheckFeedback[order.id] && <small role={paymentCheckFeedback[order.id].error ? 'alert' : 'status'}>{paymentCheckFeedback[order.id].message}</small>}
                    </span>}
                  </span>
                  <span className="order-status-cell" role="cell">
                    <span className={`status-badge ${info.tone}`}><span className="order-status-light" aria-hidden="true" />{info.label}</span>
                    <span className="order-progress" role="group" aria-label={`Andamento do pedido ${order.id}: ${info.label}`}>
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
                    </span>
                  </span>
                  <span role="cell">{order.items?.length || 0}</span>
                  <span role="cell">{order.total || 'R$ 0,00'}<small className="customer-order-payment-status">Pagamento: {paymentStatusLabels[order.paymentStatus] || order.paymentStatus || 'Não informado'}</small></span>
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
        ref={refundDialogRef}
        className="refund-request-dialog"
        aria-labelledby="refund-request-title"
        aria-describedby="refund-request-description"
        onClose={() => setRefundOrder(null)}
        onClick={(event) => { if (event.target === refundDialogRef.current) event.currentTarget.close(); }}
      >
        {refundOrder && <form className="refund-request-form" onSubmit={submitRefundRequest}>
          <header>
            <span className="orders-kicker">Atendimento da compra</span>
            <h2 id="refund-request-title">Solicitar estorno</h2>
            <p id="refund-request-description">Pedido {refundOrder.id}</p>
          </header>
          <div className="refund-request-warning" role="note">
            O registro não devolve dinheiro. A solicitação será analisada pela loja e qualquer estorno financeiro dependerá da integração com a gateway.
          </div>
          <p className="refund-request-limit">Saldo máximo ainda disponível para solicitar: <strong>{currencyFormatter.format(getRemainingRefundCents(refundOrder.total, refundOrder.refundRequests || []) / 100)}</strong></p>
          <label htmlFor="refund-request-amount">Valor solicitado (R$)</label>
          <input
            id="refund-request-amount"
            type="number"
            min="0.01"
            max={(getRemainingRefundCents(refundOrder.total, refundOrder.refundRequests || []) / 100).toFixed(2)}
            step="0.01"
            inputMode="decimal"
            required
            value={refundAmount}
            onChange={(event) => setRefundAmount(event.target.value)}
          />
          <label htmlFor="refund-request-reason">Motivo</label>
          <textarea id="refund-request-reason" minLength={8} maxLength={500} required value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
          {refundError && <p className="refund-request-error" role="alert">{refundError}</p>}
          <div className="refund-request-actions">
            <button type="button" className="secondary-cta" disabled={refundBusy} onClick={() => refundDialogRef.current?.close()}>Cancelar</button>
            <button type="submit" className="primary-cta" disabled={refundBusy}>{refundBusy ? 'Registrando...' : 'Registrar solicitação'}</button>
          </div>
        </form>}
      </dialog>
    </div>
  );
}
