'use client';

import { CheckCircle2, ClipboardList, Clock3, CreditCard, MapPin, PackageCheck, Search, ShoppingBag, Truck, UserRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';

const statuses = ['Todos', 'Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido', 'Cancelado'];
const paymentLabels = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro / combinar' };

export default function ERPOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState('Todos');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/erp/orders')
      .then((response) => response.json())
      .then(({ orders: savedOrders = [] }) => setOrders(savedOrders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
    setAcknowledged(JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]'));
  }, []);

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
    try {
      const response = await fetch('/api/erp/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, status: order.status }) });
      const { order: updated } = await response.json();
      if (!response.ok) throw new Error('Não foi possível atualizar o pedido.');
      setOrders((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(updated);
    } finally {
      setBusy(false);
    }
  };

  const filteredOrders = useMemo(() => sortOrdersNewestFirst(orders.filter((order) => {
    const text = `${order.id || ''} ${order.customerName || ''} ${order.customerEmail || ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (status === 'Todos' || order.status === status);
  })), [orders, query, status]);

  const metrics = [
    ['Pedidos recebidos', orders.filter((order) => order.status === 'Recebido').length, ClipboardList],
    ['Em separacao', orders.filter((order) => order.status === 'Separacao').length, PackageCheck],
    ['Em expedicao', orders.filter((order) => order.status === 'Expedicao').length, Truck],
    ['Em transito', orders.filter((order) => order.status === 'Em transito').length, Clock3],
    ['Concluido', orders.filter((order) => order.status === 'Concluido').length, CheckCircle2],
  ];

  return (
    <div className="erp-orders-page">
      <div className="erp-customer-header"><div><span className="eyebrow">Operacao logistica</span><h1>Pedidos</h1><p>Pedidos, separacao, expedicao e status de entrega.</p></div></div>
      <div className="erp-customer-metrics">{metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}</div>
      {newOrders.length > 0 && <section className="erp-new-orders-alert"><div><strong>Novos pedidos aguardando atenção</strong><span>{newOrders.length} pedido(s) recebido(s) aguardando conferência e separação.</span></div><div className="erp-new-order-list">{newOrders.map((order) => <div className="erp-new-order-item" key={order.id}><span><b>{order.id}</b> · {order.customerName || order.customerEmail}</span><button type="button" onClick={() => { setStatus('Recebido'); setQuery(order.id); }}>Ver separação</button><button type="button" className="erp-ack-button" onClick={() => acknowledge(order.id)}>Ciente</button></div>)}</div></section>}
      <div className="erp-customer-toolbar"><div className="erp-customer-search"><Search size={16} /><input placeholder="Buscar por pedido ou cliente" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="erp-order-workspace"><section className="erp-customer-table-card"><div className="erp-table-heading"><div><h3>Fila operacional</h3><p>{loading ? 'Carregando pedidos reais...' : `${filteredOrders.length} pedidos encontrados`}</p></div></div>{filteredOrders.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Itens</th><th>Total</th><th>Status</th></tr></thead><tbody>{filteredOrders.map((order) => <tr key={order.id} className={selected?.id === order.id ? 'selected-row' : ''} onClick={() => setSelected(order)}><td><strong>{order.id}</strong><small>{order.address || 'Endereço não informado'}</small></td><td>{order.customerName || order.customerEmail || 'Cliente não identificado'}</td><td>{order.createdAt || 'Data não informada'}</td><td>{order.items?.length || 0}</td><td>{order.total || 'R$ 0,00'}</td><td><span className="erp-status">{order.status || 'Recebido'}</span></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">{loading ? 'Carregando pedidos reais...' : 'Nenhum pedido registrado ainda. Os pedidos aparecerão aqui quando uma compra real for finalizada.'}</div>}</section>{selected && <aside className="erp-order-detail"><div className="erp-panel-title"><ShoppingBag size={17} /><div><h3>{selected.id}</h3><p>{selected.status}</p></div></div><div className="erp-order-customer"><UserRound size={15} /> <strong>{selected.customerName || 'Cliente não identificado'}</strong><span>{selected.customerEmail}</span></div><div className="erp-order-address"><MapPin size={15} /><span>{selected.address || 'Endereço não informado'}</span></div><div className="erp-order-address"><CreditCard size={15} /><span>Pagamento: {paymentLabels[selected.paymentMethod] || 'Não informado'}</span></div><h4>Itens comprados</h4><div className="erp-order-items">{(selected.items || []).map((item) => <div key={item.name}><strong>{item.name}</strong><span>Qtd. {formatCartQuantity(item)} · {item.price}</span></div>)}</div><button type="button" className="primary-cta erp-advance-button" disabled={busy || !['Recebido', 'Separacao', 'Expedicao', 'Em transito'].includes(selected.status)} onClick={() => advanceOrder(selected)}>{selected.status === 'Recebido' ? 'Aceitar e enviar para separação' : selected.status === 'Separacao' ? 'Prosseguir para expedição' : selected.status === 'Expedicao' ? 'Confirmar envio à transportadora' : selected.status === 'Em transito' ? 'Confirmar entrega concluída' : 'Entrega concluída'}</button></aside>}</div>
    </div>
  );
}
