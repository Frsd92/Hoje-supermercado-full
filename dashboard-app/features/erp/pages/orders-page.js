'use client';

import { AlertCircle, CheckCircle2, ClipboardList, Clock3, CreditCard, FileText, MapPin, PackageCheck, Printer, Search, ShoppingBag, Truck, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import OrderReceipt from '@/features/orders/order-receipt';

const statuses = ['Todos', 'Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido', 'Cancelado'];
const paymentLabels = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro / combinar' };
const formatInvoiceCpf = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '';
};

export default function ERPOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('Todos');
  const [cpfRequestFilter, setCpfRequestFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [acknowledged, setAcknowledged] = useState([]);
  const [selected, setSelected] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const receiptDialogRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

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
    const dialog = receiptDialogRef.current;
    if (receiptOrder && dialog && !dialog.open) dialog.showModal();
  }, [receiptOrder]);

  const newOrders = orders.filter((order) => order.status === 'Recebido' && !acknowledged.includes(order.id));
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

  const filteredOrders = useMemo(() => sortOrdersNewestFirst(orders.filter((order) => {
    const text = `${order.id || ''} ${order.customerName || ''} ${order.customerEmail || ''}`.toLowerCase();
    const cpfRequestMatches = cpfRequestFilter === 'all'
      || (cpfRequestFilter === 'requested' && order.includeCpfOnReceipt === true)
      || (cpfRequestFilter === 'not-requested' && order.includeCpfOnReceipt === false)
      || (cpfRequestFilter === 'unknown' && (order.includeCpfOnReceipt === null || order.includeCpfOnReceipt === undefined));
    return text.includes(query.toLowerCase())
      && (status === 'Todos' || order.status === status)
      && cpfRequestMatches;
  })), [cpfRequestFilter, orders, query, status]);

  const metrics = [
    ['Pedidos recebidos', orders.filter((order) => order.status === 'Recebido').length, ClipboardList],
    ['Em separacao', orders.filter((order) => order.status === 'Separacao').length, PackageCheck],
    ['Em expedicao', orders.filter((order) => order.status === 'Expedicao').length, Truck],
    ['Em transito', orders.filter((order) => order.status === 'Em transito').length, Clock3],
    ['Concluido', orders.filter((order) => order.status === 'Concluido').length, CheckCircle2],
    ['CPF solicitado', orders.filter((order) => order.includeCpfOnReceipt === true).length, FileText],
  ];

  return (
    <div className="erp-orders-page">
      <div className="erp-customer-header">
        <div>
          <span className="eyebrow">Operacao logistica</span>
          <h1>Pedidos</h1>
          <p>Pedidos, separacao, expedicao e status de entrega.</p>
        </div>
      </div>
      <div className="erp-receipt-integration-note" role="note">
        <FileText size={18} aria-hidden="true" />
        <span><strong>Comprovantes e situação fiscal</strong><span>Os comprovantes desta tela são informativos e vinculados ao ID e à data do pedido. Não são NFC-e/NF-e. A emissão fiscal oficial ainda depende da configuração de uma integração autorizada.</span></span>
      </div>
      {loadError && <p className="erp-budget-warning" role="alert">{loadError}<button type="button" onClick={() => setReloadToken((value) => value + 1)}>Tentar novamente</button></p>}
      {ordersLoaded && <div className="erp-customer-metrics">
        {metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}
      </div>}
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
        <div className="erp-customer-search"><Search size={16} /><input placeholder="Buscar por pedido ou cliente" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <select aria-label="Filtrar pedidos por situação" value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Filtrar pedidos por solicitação de CPF" value={cpfRequestFilter} onChange={(event) => setCpfRequestFilter(event.target.value)}>
          <option value="all">Todos os pedidos · CPF</option>
          <option value="requested">CPF solicitado</option>
          <option value="not-requested">Sem CPF solicitado</option>
          <option value="unknown">Solicitação não informada</option>
        </select>
      </div>
      <div className="erp-order-workspace">
        <section className="erp-customer-table-card">
          <div className="erp-table-heading">
            <div><h3>Fila operacional</h3><p>{loading ? 'Carregando pedidos reais...' : `${filteredOrders.length} pedidos encontrados`}</p></div>
          </div>
          {filteredOrders.length
            ? <div className="erp-table-scroll"><table className="erp-table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>CPF solicitado</th><th>Status</th></tr></thead>
              <tbody>{filteredOrders.map((order) => <tr key={order.id} className={selected?.id === order.id ? 'selected-row' : ''} onClick={() => { setSelected(order); setActionError(''); }}>
                <td><strong>{order.id}</strong><small>{order.address || 'Endereço não informado'}</small></td>
                <td>{order.customerName || order.customerEmail || 'Cliente não identificado'}</td>
                <td>{order.createdAt || 'Data não informada'}</td>
                <td>{order.items?.length || 0}</td>
                <td>{order.total || 'R$ 0,00'}</td>
                <td>{order.includeCpfOnReceipt === true ? <span className="erp-invoice-cpf-requested">Sim</span> : order.includeCpfOnReceipt === false ? 'Não' : '—'}</td>
                <td><span className="erp-status">{order.status || 'Recebido'}</span></td>
              </tr>)}</tbody>
            </table></div>
            : <div className="erp-empty-data">{loading ? 'Carregando pedidos reais...' : loadError ? 'Não foi possível carregar a fila de pedidos.' : 'Nenhum pedido registrado ainda. Os pedidos aparecerão aqui quando uma compra real for finalizada.'}</div>}
        </section>
        {selected && <aside className="erp-order-detail">
          <div className="erp-panel-title"><ShoppingBag size={17} /><div><h3>{selected.id}</h3><p>{selected.status}</p></div></div>
          <div className="erp-order-customer"><UserRound size={15} /><strong>{selected.customerName || 'Cliente não identificado'}</strong><span>{selected.customerEmail}</span></div>
          <div className="erp-order-address"><MapPin size={15} /><span>{selected.address || 'Endereço não informado'}</span></div>
          <div className="erp-order-address"><CreditCard size={15} /><span>Pagamento: {paymentLabels[selected.paymentMethod] || 'Não informado'}</span></div>
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
            <span className="erp-order-fiscal-state">Sem registro de emissão</span>
            <strong>Documento fiscal oficial (NFC-e/NF-e)</strong>
            <p>O pedido registra a preferência de CPF, mas este sistema ainda não emite nem armazena documento fiscal autorizado.</p>
          </div>
          <button type="button" className="secondary-cta erp-order-receipt-button" aria-haspopup="dialog" onClick={() => setReceiptOrder(selected)}>
            <FileText size={16} aria-hidden="true" />Abrir comprovante informativo
          </button>
          <h4>Itens comprados</h4>
          <div className="erp-order-items">{(selected.items || []).map((item) => <div key={item.name}><strong>{item.name}</strong><span>Qtd. {formatCartQuantity(item)} · {item.price}</span></div>)}</div>
          {selected.status === 'Recebido' && <p className="erp-order-fefo-note"><PackageCheck size={15} /> Ao iniciar a separação, o sistema reserva primeiro os lotes com validade mais próxima.</p>}
          {actionError && <p className="erp-order-action-error" role="alert"><AlertCircle size={16} />{actionError}</p>}
          <button type="button" className="primary-cta erp-advance-button" disabled={busy || !['Recebido', 'Separacao', 'Expedicao', 'Em transito'].includes(selected.status)} onClick={() => advanceOrder(selected)}>
            {selected.status === 'Recebido' ? 'Aceitar e enviar para separação' : selected.status === 'Separacao' ? 'Prosseguir para expedição' : selected.status === 'Expedicao' ? 'Confirmar envio à transportadora' : selected.status === 'Em transito' ? 'Confirmar entrega concluída' : 'Entrega concluída'}
          </button>
        </aside>}
      </div>
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
