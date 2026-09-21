'use client';

import { BarChart3, CircleDollarSign, Package, ShoppingBag } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ReportsPage() {
  const [orders, setOrders] = useState([]);
  useEffect(() => { fetch('/api/erp/orders').then((response) => response.json()).then(({ orders: items = [] }) => setOrders(items)).catch(() => setOrders([])); }, []);
  const total = orders.reduce((sum, order) => sum + (Number(String(order.total || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0), 0);
  const metrics = [['Pedidos registrados', orders.length, ShoppingBag], ['Faturamento registrado', `R$ ${total.toFixed(2).replace('.', ',')}`, CircleDollarSign], ['Entregas concluídas', orders.filter((order) => order.status === 'Concluido').length, Package], ['Margem e lucro', 'Sem dados', BarChart3]];
  return <div className="erp-module-page"><div className="erp-customer-header"><div><span className="eyebrow">Inteligência de negócio</span><h1>Relatórios</h1><p>Indicadores calculados exclusivamente de dados registrados.</p></div></div><div className="erp-customer-metrics">{metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}</div><div className="erp-empty-data">Mais relatórios estarão disponíveis quando custos, estoque e produtos forem cadastrados e vinculados às vendas.</div></div>;
}