'use client';

import Link from 'next/link';
import { PackageOpen } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getOrderStatus, orderStages } from '../order-status';
import { sortOrdersNewestFirst } from '@/lib/order-sort';

const tabs = ['Todos', 'Recebido', 'Separacao', 'Expedicao', 'Em transito', 'Concluido'];
const labels = { Recebido: 'Recebido', Separacao: 'Em separação', Expedicao: 'Em expedição', 'Em transito': 'Em trânsito', Concluido: 'Entrega concluída', Cancelado: 'Cancelado' };

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('Todos');

  useEffect(() => {
    let active = true;
    const load = () => fetch('/api/my/orders').then((response) => response.json()).then(({ orders: savedOrders = [] }) => { if (active) setOrders(savedOrders); }).catch(() => { if (active) setOrders([]); });
    load();
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = window.setInterval(refreshWhenVisible, 30000);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { active = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshWhenVisible); };
  }, []);

  const filteredOrders = useMemo(() => sortOrdersNewestFirst(activeTab === 'Todos' ? orders : orders.filter((order) => order.status === activeTab)), [activeTab, orders]);

  return <div className="section-shell orders-showcase"><div className="section-header orders-header"><div><span className="orders-kicker">Central de acompanhamento</span><h1>Meus Pedidos</h1><p>Acompanhe cada etapa da sua compra em tempo real.</p></div><div className="orders-header-mark"><span className="orders-header-dot" />{orders.length ? `${orders.length} pedidos` : 'Sem pedidos'}</div></div><div className="tab-row order-status-tabs" aria-label="Filtrar pedidos">{tabs.map((tab) => { const info = tab === 'Todos' ? null : getOrderStatus(tab); const label = tab === 'Separacao' ? 'Em separação' : tab === 'Expedicao' ? 'Em expedição' : tab === 'Em transito' ? 'Em trânsito' : tab === 'Concluido' ? 'Entrega concluída' : tab; return <button key={tab} type="button" className={`${activeTab === tab ? 'active' : ''} ${info ? `status-filter-${info.tone}` : 'all-filter'}`} onClick={() => setActiveTab(tab)}>{info && <span className="order-status-light" />}{label}</button>; })}</div>{filteredOrders.length === 0 ? <div className="empty-state"><div className="empty-state-box"><PackageOpen size={38} /></div><h3>Nenhum pedido encontrado</h3><p>Seus pedidos reais aparecerão aqui após a finalização da compra.</p><Link href="/dashboard" className="primary-cta">Continuar Comprando</Link></div> : <div className="orders-panel"><div className="orders-table"><div className="table-head"><span>Pedido</span><span>Status</span><span>Itens</span><span>Total</span></div>{filteredOrders.map((order) => { const info = getOrderStatus(order.status); const currentStage = orderStages.indexOf(order.status); return <div key={order.id} className="table-row"><span>{order.id}</span><span className="order-status-cell"><span className={`status-badge ${info.tone}`}><span className="order-status-light" />{info.label}</span><span className="order-progress" aria-label={`Estágio atual: ${info.label}`}>{orderStages.map((stage, index) => { const stageInfo = getOrderStatus(stage); return <button key={stage} type="button" title={`Filtrar ${stageInfo.label}`} className={`order-progress-step ${index < currentStage ? 'done' : ''} ${index === currentStage ? 'current' : ''} ${stageInfo.tone}`} onClick={() => setActiveTab(stage)}><span className="order-status-light" /><span className="order-progress-label">{stageInfo.label}</span></button>; })}</span></span><span>{order.items?.length || 0}</span><span>{order.total || 'R$ 0,00'}</span></div>; })}</div></div>}</div>;
}
