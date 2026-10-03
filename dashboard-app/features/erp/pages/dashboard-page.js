'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Boxes, CalendarClock, CheckCircle2, CircleDollarSign, FilePlus2, History, PackageX, RefreshCw, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createSparklinePoints, deriveDashboardMetrics } from './dashboard-metrics.js';

export default function ERPPage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [lots, setLots] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState('');
  const [hasDashboardData, setHasDashboardData] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [refreshRequest, setRefreshRequest] = useState(0);

  useEffect(() => {
    let active = true;
    const loadDashboardData = async (showLoading = false) => {
      if (showLoading) setMetricsLoading(true);
      try {
        const [productsResponse, ordersResponse, customersResponse, inventoryResponse] = await Promise.all([
          fetch('/api/products', { cache: 'no-store' }),
          fetch('/api/erp/orders', { cache: 'no-store' }),
          fetch('/api/erp/customers', { cache: 'no-store' }),
          fetch('/api/erp/validade', { cache: 'no-store' }),
        ]);
        const responses = [
          { name: 'Catálogo de produtos', response: productsResponse },
          { name: 'Pedidos', response: ordersResponse },
          { name: 'Clientes', response: customersResponse },
          { name: 'Lotes de estoque', response: inventoryResponse },
        ];
        const failedResponse = responses.find(({ response }) => !response.ok);
        if (failedResponse) {
          let errorMessage = `${failedResponse.name} indisponível (HTTP ${failedResponse.response.status}).`;
          try {
            const errorData = await failedResponse.response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (parseError) {
            console.error(`Não foi possível interpretar a resposta de ${failedResponse.name}:`, parseError);
          }
          throw new Error(errorMessage);
        }
        const [productsData, ordersData, customersData, inventoryData] = await Promise.all([
          productsResponse.json(),
          ordersResponse.json(),
          customersResponse.json(),
          inventoryResponse.json(),
        ]);
        if (!active) return;
        if (
          !Array.isArray(productsData.products)
          || !Array.isArray(ordersData.orders)
          || !Array.isArray(customersData.customers)
          || !Array.isArray(inventoryData.lots)
        ) {
          throw new Error('Os dados recebidos pelo Dashboard do ERP estão incompletos. Atualize a página ou tente novamente.');
        }
        setProducts(productsData.products);
        setOrders(ordersData.orders);
        setCustomers(customersData.customers);
        setLots(inventoryData.lots);
        setMetricsError('');
        setHasDashboardData(true);
        setLastUpdatedAt(new Date());
      } catch (error) {
        console.error('Não foi possível atualizar os indicadores do ERP:', error);
        if (active) {
          setMetricsError(error.message || 'Não foi possível atualizar os indicadores do ERP.');
        }
      } finally {
        if (active && showLoading) setMetricsLoading(false);
      }
    };

    loadDashboardData(true);
    const refreshTimer = window.setInterval(() => loadDashboardData(), 30000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [refreshRequest]);

  const dashboardMetrics = deriveDashboardMetrics({ products, orders, customers, lots });
  const formatter = new Intl.NumberFormat('pt-BR');
  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const displayValue = (value) => hasDashboardData ? value : metricsLoading ? '...' : '—';
  const displayDetail = (value) => hasDashboardData ? value : metricsLoading ? 'Carregando dados atualizados' : 'Dados indisponíveis';
  const marginDetail = dashboardMetrics.averageMarginPercent === null
    ? dashboardMetrics.monthlyRevenue > 0
      ? 'Cadastre os custos dos produtos vendidos para calcular'
      : 'Sem vendas no mês atual'
    : 'Estimativa com os custos cadastrados no catálogo';
  const expiringLotAlerts = dashboardMetrics.expiredLotsCount + dashboardMetrics.expiringLotsInThirtyDaysCount;
  const recentRevenue = dashboardMetrics.recentDailyMetrics.map(({ revenue }) => revenue);
  const recentAverageTicket = dashboardMetrics.recentDailyMetrics.map(({ averageTicket }) => averageTicket);

  const metricSections = [
    {
      title: 'Desempenho comercial',
      description: 'Resultados do mês atual e relacionamento com clientes',
      metrics: [
        { label: 'Faturamento no mês', value: formatCurrency(dashboardMetrics.monthlyRevenue), detail: `${formatter.format(dashboardMetrics.monthOrderCount)} pedido(s) no mês atual`, icon: CircleDollarSign, tone: 'green', href: '/erp/orders', chartValues: recentRevenue, chartDescription: 'Faturamento diário' },
        { label: 'Margem média', value: dashboardMetrics.averageMarginPercent === null ? '—' : `${dashboardMetrics.averageMarginPercent.toFixed(1).replace('.', ',')}%`, detail: marginDetail, icon: TrendingUp, tone: 'gold', href: '/erp/reports' },
        { label: 'Ticket médio', value: dashboardMetrics.averageTicket === null ? '—' : formatCurrency(dashboardMetrics.averageTicket), detail: 'Valor médio por pedido neste mês', icon: ShoppingCart, tone: 'blue', href: '/erp/orders', chartValues: recentAverageTicket, chartDescription: 'Ticket médio diário' },
        { label: 'Clientes ativos', value: formatter.format(dashboardMetrics.activeCustomerCount), detail: 'Clientes com cadastro ativo', icon: Users, tone: 'violet', href: '/erp/customers' },
      ],
    },
    {
      title: 'Operação e estoque',
      description: 'Pontos de atenção para orientar as próximas ações',
      metrics: [
        { label: 'Produtos ativos', value: formatter.format(dashboardMetrics.activeProductCount), detail: 'Disponíveis no catálogo do ERP', icon: Boxes, tone: 'blue', href: '/erp/products' },
        { label: 'Pedidos aguardando', value: formatter.format(dashboardMetrics.pendingOrderCount), detail: 'Aguardam conferência da equipe', icon: ShoppingCart, tone: 'gold', href: '/erp/orders' },
        { label: 'Produtos sem saldo', value: formatter.format(dashboardMetrics.outOfStockProductCount), detail: 'Produtos ativos com estoque zerado', icon: PackageX, tone: 'violet', href: '/erp/products' },
        { label: 'Lotes com alerta', value: formatter.format(expiringLotAlerts), detail: `${formatter.format(dashboardMetrics.expiringLotsInThirtyDaysCount)} vencendo em 30 dias · ${formatter.format(dashboardMetrics.expiredLotsCount)} vencidos`, icon: CalendarClock, tone: 'green', href: '/erp/validade' },
      ],
    },
  ];

  const operationAlerts = [
    dashboardMetrics.expiredLotsCount > 0 && {
      title: `${formatter.format(dashboardMetrics.expiredLotsCount)} lote(s) vencido(s)`,
      detail: 'Revise a validade e a disponibilidade dos produtos.',
      href: '/erp/validade',
      icon: AlertTriangle,
      tone: 'danger',
    },
    dashboardMetrics.expiringLotsInThirtyDaysCount > 0 && {
      title: `${formatter.format(dashboardMetrics.expiringLotsInThirtyDaysCount)} lote(s) próximos da validade`,
      detail: `${formatter.format(dashboardMetrics.expiringLotsInSevenDaysCount)} vencem nos próximos 7 dias.`,
      href: '/erp/validade',
      icon: CalendarClock,
      tone: 'warning',
    },
    dashboardMetrics.outOfStockProductCount > 0 && {
      title: `${formatter.format(dashboardMetrics.outOfStockProductCount)} produto(s) ativo(s) sem saldo`,
      detail: 'Confira a necessidade de reposição no catálogo.',
      href: '/erp/products',
      icon: PackageX,
      tone: 'warning',
    },
    dashboardMetrics.pendingOrderCount > 0 && {
      title: `${formatter.format(dashboardMetrics.pendingOrderCount)} pedido(s) aguardando conferência`,
      detail: 'Acesse a fila para avançar o atendimento.',
      href: '/erp/orders',
      icon: ShoppingCart,
      tone: 'info',
    },
  ].filter(Boolean);

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

      {metricsError && <div className="erp-dashboard-error" role="alert">
        <AlertTriangle size={18} aria-hidden="true" />
        <span>{metricsError}{hasDashboardData ? ' Os últimos indicadores carregados foram mantidos.' : ''}</span>
        <button type="button" className="primary-cta" onClick={() => setRefreshRequest((current) => current + 1)} disabled={metricsLoading}>
          <RefreshCw size={15} aria-hidden="true" />{metricsLoading ? 'Atualizando...' : 'Tentar novamente'}
        </button>
      </div>}

      <div className="erp-dashboard-sections" aria-busy={metricsLoading && !hasDashboardData}>
        {metricSections.map((section, index) => <section className="erp-dashboard-section" aria-labelledby={`erp-dashboard-section-${index}`} key={section.title}>
          <div className="erp-dashboard-section-heading">
            <div><h2 id={`erp-dashboard-section-${index}`}>{section.title}</h2><p>{section.description}</p></div>
            {index === 0 && lastUpdatedAt && <span>Atualizado às {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(lastUpdatedAt)}</span>}
          </div>
          <div className="erp-metrics-grid erp-dashboard-metrics">
            {section.metrics.map(({ label, value, detail, icon: Icon, tone, href, chartValues, chartDescription }) => {
              const chartPoints = createSparklinePoints(chartValues);
              return <Link
                href={href}
                key={label}
                className={`erp-metric erp-dashboard-metric ${tone}`}
                aria-label={`${label}: ${displayValue(value)}. ${displayDetail(detail)}.${chartPoints ? ` ${chartDescription} nos últimos 7 dias.` : ''} Abrir ${href === '/erp/validade' ? 'controle de validade' : href.split('/').pop().replace(/-/g, ' ')}.`}
              >
                <span className="erp-metric-icon"><Icon size={18} aria-hidden="true" /></span>
                <strong>{displayValue(value)}</strong>
                <span>{label}</span>
                <small>{displayDetail(detail)}</small>
                {chartPoints && <div className={`erp-dashboard-sparkline ${tone}`} aria-hidden="true">
                  <span>7 dias</span>
                  <svg viewBox="0 0 100 28" preserveAspectRatio="none" focusable="false">
                    <polyline points={chartPoints} />
                  </svg>
                </div>}
                <ArrowUpRight className="erp-dashboard-metric-arrow" size={16} aria-hidden="true" />
              </Link>;
            })}
          </div>
        </section>)}
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

      <section className="erp-alert-panel erp-dashboard-alert-panel" aria-labelledby="erp-dashboard-alerts-title">
        <div className="erp-panel-title"><AlertTriangle size={17} aria-hidden="true" /><div><h2 id="erp-dashboard-alerts-title">Prioridades operacionais</h2><p>Ações sugeridas com base no estoque e nos pedidos</p></div></div>
        {metricsLoading && !hasDashboardData
          ? <div className="erp-empty-data" role="status">Analisando estoque e pedidos...</div>
          : !hasDashboardData
            ? <div className="erp-empty-data" role="status">Os alertas estarão disponíveis quando os indicadores forem carregados.</div>
            : operationAlerts.length
              ? <div className="erp-dashboard-alerts">{operationAlerts.map(({ title, detail, href, icon: Icon, tone }) => <Link href={href} className={`erp-dashboard-alert ${tone}`} key={title}>
                <Icon size={18} aria-hidden="true" />
                <span><strong>{title}</strong><small>{detail}</small></span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>)}</div>
              : <div className="erp-dashboard-all-clear"><CheckCircle2 size={18} aria-hidden="true" /><span>Nenhuma prioridade operacional identificada agora.</span></div>}
      </section>

    </div>
  );
}
