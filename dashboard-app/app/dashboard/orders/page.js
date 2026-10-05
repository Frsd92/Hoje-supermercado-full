'use client';

import Link from 'next/link';
import { FileText, PackageOpen, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getOrderStatus, orderStages } from '../order-status';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import OrderReceipt from '@/features/orders/order-receipt';

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

  const filteredOrders = useMemo(
    () => sortOrdersNewestFirst(activeTab === 'Todos' ? orders : orders.filter((order) => order.status === activeTab)),
    [activeTab, orders],
  );

  const retryLoading = () => {
    setLoadError('');
    setIsLoading(true);
    setRetryCount((count) => count + 1);
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
        <span>Você pode imprimir ou salvar o comprovante de cada pedido em PDF. Ele é informativo: não substitui uma NFC-e/NF-e e não confirma pagamento.</span>
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
              return (
                <div key={order.id} className="table-row" role="row">
                  <span className="customer-order-reference" role="cell">
                    <strong>{order.id}</strong>
                    <button type="button" className="customer-order-receipt-link" aria-label={`Ver comprovante informativo do pedido ${order.id}`} aria-haspopup="dialog" onClick={() => setReceiptOrder(order)}>
                      <FileText size={14} aria-hidden="true" />Ver comprovante
                    </button>
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
                  <span role="cell">{order.total || 'R$ 0,00'}</span>
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
    </div>
  );
}
