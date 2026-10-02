'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Boxes, CalendarClock, CircleDollarSign, FilePlus2, History, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ERPPage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const loadDashboardData = async () => {
      try {
        const [productsResponse, ordersResponse, customersResponse] = await Promise.all([
          fetch('/api/products', { cache: 'no-store' }),
          fetch('/api/erp/orders', { cache: 'no-store' }),
          fetch('/api/erp/customers', { cache: 'no-store' }),
        ]);
        if (!productsResponse.ok || !ordersResponse.ok || !customersResponse.ok) {
          throw new Error('Não foi possível carregar os dados atualizados do ERP.');
        }
        const [productsData, ordersData, customersData] = await Promise.all([
          productsResponse.json(),
          ordersResponse.json(),
          customersResponse.json(),
        ]);
        if (!active) return;
        setProducts(productsData.products || []);
        setOrders(ordersData.orders || []);
        setCustomers(customersData.customers || []);
      } catch {
        if (active) {
          setProducts([]);
          setOrders([]);
          setCustomers([]);
        }
      } finally {
        if (active) setMetricsLoading(false);
      }
    };

    loadDashboardData();
    const refreshTimer = window.setInterval(loadDashboardData, 10000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const parseMoney = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;
  const parseOrderDate = (value) => {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : new Date(value);
  };
  const activeOrders = orders.filter((order) => order.status !== 'Cancelado');
  const currentMonth = new Date();
  const monthOrders = activeOrders.filter((order) => {
    const date = parseOrderDate(order.createdAt);
    return date.getFullYear() === currentMonth.getFullYear() && date.getMonth() === currentMonth.getMonth();
  });
  const monthlyRevenue = monthOrders.reduce((total, order) => total + parseMoney(order.total), 0);
  const productByTitle = new Map(products.map((product) => [String(product.title).toLowerCase(), product]));
  const monthlyCost = monthOrders.reduce((total, order) => total + (order.items || []).reduce((itemsTotal, item) => {
    const product = productByTitle.get(String(item.name || '').toLowerCase());
    return itemsTotal + (Number(product?.cost) || 0) * (Number(item.quantity) || 1);
  }, 0), 0);
  const averageMargin = monthlyRevenue ? ((monthlyRevenue - monthlyCost) / monthlyRevenue) * 100 : 0;

  const metrics = [
    { label: 'Faturamento no mês', value: metricsLoading ? '...' : `R$ ${monthlyRevenue.toFixed(2).replace('.', ',')}`, detail: `${monthOrders.length} pedido(s) no mês atual`, icon: CircleDollarSign, tone: 'green' },
    { label: 'Margem média', value: metricsLoading ? '...' : `${averageMargin.toFixed(1).replace('.', ',')}%`, detail: monthlyRevenue ? 'Calculada sobre vendas e custos' : 'Sem vendas no mês atual', icon: TrendingUp, tone: 'gold' },
    { label: 'Produtos ativos', value: products.length, detail: 'Produtos cadastrados no ERP', icon: Boxes, tone: 'blue' },
    { label: 'Clientes ativos', value: metricsLoading ? '...' : customers.filter((customer) => customer.status === 'Ativo').length, detail: `${customers.length} cliente(s) identificado(s)`, icon: Users, tone: 'violet' },
  ];
  const quickActions = [
    { label: 'Pedidos', detail: metricsLoading ? 'Carregando fila' : `${orders.filter((order) => order.status === 'Recebido').length} aguardando conferência`, href: '/erp/orders', icon: ShoppingCart },
    { label: 'Produtos', detail: metricsLoading ? 'Carregando catálogo' : `${products.length} produto(s) cadastrado(s)`, href: '/erp/products', icon: Boxes },
    { label: 'Clientes', detail: metricsLoading ? 'Carregando clientes' : `${customers.length} cliente(s) identificado(s)`, href: '/erp/customers', icon: Users },
    { label: 'Histórico de preços', detail: 'Variações e registros por produto', href: '/erp/price-history', icon: History },
  ];

  return (
    <div className="section-shell erp-page">
      <div className="section-header erp-header">
        <div><span className="eyebrow">Centro de Operações</span><h1>Visão geral do ERP</h1><p>Acompanhe os principais números e acesse rapidamente cada área.</p></div>
        <Link href="/erp/catalog" className="primary-cta"><FilePlus2 size={16} /> Cadastro de Produto</Link>
      </div>

      <section className="erp-quick-access" aria-labelledby="erp-quick-access-title">
        <div className="erp-quick-access-heading"><h2 id="erp-quick-access-title">Acessos rápidos</h2><span>Áreas mais utilizadas</span></div>
        <div className="erp-quick-access-grid">
          {quickActions.map(({ label, detail, href, icon: Icon }) => <Link href={href} className="erp-quick-access-card" key={label}>
            <span className="erp-quick-access-icon"><Icon size={18} /></span>
            <span className="erp-quick-access-copy"><strong>{label}</strong><small>{detail}</small></span>
            <ArrowUpRight size={16} className="erp-quick-access-arrow" />
          </Link>)}
        </div>
      </section>

      <div className="erp-metrics-grid">{metrics.map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className={`erp-metric ${tone}`}><div className="erp-metric-icon"><Icon size={18} /></div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>)}</div>

      <div className="erp-alert-grid"><div className="erp-alert-panel"><div className="erp-panel-title"><AlertTriangle size={17} /><div><h3>Atenção operacional</h3><p>Itens que precisam de ação hoje</p></div></div><div className="erp-empty-data">Nenhum alerta registrado.</div></div><div className="erp-alert-panel"><div className="erp-panel-title"><CalendarClock size={17} /><div><h3>Indicadores de operação</h3><p>Dados consolidados para decisão</p></div></div><div className="erp-empty-data">Sem dados operacionais suficientes.</div></div></div>

    </div>
  );
}
