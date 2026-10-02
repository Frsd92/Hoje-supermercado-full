'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, BarChart3, Boxes, CalendarClock, CircleDollarSign, Eye, FilePlus2, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buildPriceChart, formatPriceAxis, formatPriceTimeAxis, getEffectiveRecordedPrice, getPriceHistorySyncStatus, PRICE_RANGES, priceChartY } from './price-chart.js';

const priceDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getPriceDateKey(date) {
  return priceDateFormatter.format(date);
}

function formatPriceUpdate(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Último registro de preço sem data';
  const today = getPriceDateKey(new Date()) === getPriceDateKey(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (today) return `Última atualização: hoje, ${time}`;
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
  }).format(date).replace('.', '');
  return `Última atualização: ${day} • ${time}`;
}

function formatPrice(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

export default function ERPPage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [priceRange, setPriceRange] = useState('1D');
  const [hoveredPriceIndex, setHoveredPriceIndex] = useState(null);
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
  useEffect(() => {
    setHoveredPriceIndex(null);
  }, [selectedProductId, priceRange]);

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

  const selectedProduct = products.find((product) => product.id === selectedProductId) || products[0];
  const recordedPrices = (selectedProduct?.priceHistory || [])
    .filter((point) => !Number.isNaN(new Date(point.date).getTime()) && Number.isFinite(Number(point.price)))
    .map((point) => ({ ...point, price: getEffectiveRecordedPrice(point) }))
    .sort((first, second) => new Date(first.date) - new Date(second.date));
  const priceHistory = recordedPrices.filter((point, index) => index === 0 || Number(point.price) !== Number(recordedPrices[index - 1].price));
  const chartData = buildPriceChart(priceHistory, priceRange);
  const chartPoints = chartData.points;
  const chartCoordinates = chartPoints.map((point) => ({
    ...point,
    x: 32 + ((point.xDate.getTime() - chartData.start.getTime()) / (chartData.end.getTime() - chartData.start.getTime())) * 348,
    y: priceChartY(point.price, chartData.min, chartData.max),
  }));
  const chartPath = chartCoordinates.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const previous = chartCoordinates[index - 1];
    return `${path} L ${point.x.toFixed(2)} ${previous.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }, '');
  const completeChartPath = chartPath
    ? `${chartPath} L 380 ${chartCoordinates[chartCoordinates.length - 1].y.toFixed(2)}`
    : '';
  const chartAreaPath = completeChartPath
    ? `${completeChartPath} L 380 100 L 32 100 Z`
    : '';
  const chartTimeLabels = chartData.points.length
    ? [chartData.start, new Date((chartData.start.getTime() + chartData.end.getTime()) / 2), chartData.end]
    : [];
  const latestPrice = Number(selectedProduct?.salePrice ?? selectedProduct?.price ?? 0);
  const priceSyncStatus = getPriceHistorySyncStatus(priceHistory, latestPrice);
  const openingPrice = chartPoints[0]?.price ?? null;
  const hoveredPricePoint = hoveredPriceIndex === null ? null : chartCoordinates[hoveredPriceIndex] || null;
  const displayedPrice = hoveredPricePoint?.price ?? latestPrice;
  const displayedDelta = openingPrice === null ? 0 : displayedPrice - Number(openingPrice);
  const displayedPercent = openingPrice ? (displayedDelta / Number(openingPrice)) * 100 : 0;
  const tooltipX = hoveredPricePoint ? Math.min(296, Math.max(35, hoveredPricePoint.x + 3)) : 0;
  const tooltipY = hoveredPricePoint ? Math.max(2, hoveredPricePoint.y - 20) : 0;
  const latestPriceDate = priceHistory.length ? new Date(priceHistory[priceHistory.length - 1].date) : null;

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
    { label: 'Analytics', detail: 'Vendas, clientes e operação', href: '/erp/analytics', icon: BarChart3 },
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

      <section className="erp-chart-panel">
        <div className="erp-table-heading">
          <div><span className="eyebrow">Preços do Hoje</span><h3>Histórico de preço</h3><p>O ERP registra cada alteração de preço com data e responsável; o gráfico exibe apenas registros reais.</p></div>
          <select value={selectedProduct?.id || ''} onChange={(event) => setSelectedProductId(event.target.value)} aria-label="Selecionar produto do gráfico">
            <option value="">Selecione um produto</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
          </select>
        </div>
        {selectedProduct ? <>
          <div className="erp-chart-summary">
            <strong>{formatPrice(displayedPrice)}</strong>
            <span className={displayedDelta > 0 ? 'up' : displayedDelta < 0 ? 'down' : ''}>{displayedDelta > 0 ? '↑ ' : displayedDelta < 0 ? '↓ ' : ''}{displayedPercent.toFixed(2).replace('.', ',')}%</span>
            <span className={`erp-chart-daily-change${displayedDelta > 0 ? ' up' : displayedDelta < 0 ? ' down' : ''}`}>{displayedDelta > 0 ? '+' : displayedDelta < 0 ? '−' : ''}{formatPrice(Math.abs(displayedDelta))} {priceRange === '1D' ? 'hoje' : 'no período'}</span>
          </div>
          {priceSyncStatus.status === 'mismatch' && <p className="erp-chart-data-warning" role="status">O preço atual ({formatPrice(priceSyncStatus.currentPrice)}) difere do último registro real ({formatPrice(priceSyncStatus.recordedPrice)}). O gráfico preserva os registros existentes e não cria um ponto estimado.</p>}
          {priceSyncStatus.status === 'missing' && <p className="erp-chart-data-warning" role="status">Este produto ainda não tem histórico de preço registrado. O gráfico não estima dados anteriores.</p>}
          {hoveredPricePoint && <p className="erp-chart-hover-date">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(hoveredPricePoint.date)}</p>}
          <p className="erp-chart-update">{formatPriceUpdate(latestPriceDate)}</p>
          <div className="erp-chart-ranges" role="group" aria-label="Período do histórico de preços">
            {PRICE_RANGES.map(({ id, label }) => <button type="button" key={id} aria-pressed={priceRange === id} className={priceRange === id ? 'active' : ''} onClick={() => setPriceRange(id)}>{label}</button>)}
          </div>
          {chartPoints.length ? <div className="erp-line-chart" onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = 32 + ((event.clientX - bounds.left) / bounds.width) * 348;
            const nearestIndex = chartCoordinates.reduce((nearest, point, index) => (
              Math.abs(point.x - x) < Math.abs(chartCoordinates[nearest].x - x) ? index : nearest
            ), 0);
            setHoveredPriceIndex(nearestIndex);
          }} onPointerLeave={() => setHoveredPriceIndex(null)}>
            <svg viewBox="0 0 390 100" role="img" aria-label={`Histórico de preço de ${selectedProduct.title} no período ${priceRange}`} preserveAspectRatio="none">
              <defs><linearGradient id="price-chart-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8ab4f8" stopOpacity=".24" /><stop offset="100%" stopColor="#8ab4f8" stopOpacity="0" /></linearGradient></defs>
              {chartData.ticks.map((tick) => {
                const y = priceChartY(tick, chartData.min, chartData.max);
                return <g key={tick}><path className="chart-grid-line" d={`M 32 ${y} H 380`} /><text className="chart-axis-label" x="28" y={y + 1.5} textAnchor="end">{formatPriceAxis(tick)}</text></g>;
              })}
              {hoveredPricePoint && <g className="chart-crosshair"><path d={`M ${hoveredPricePoint.x} 10 V 90`} /><path d={`M 32 ${hoveredPricePoint.y} H 380`} /></g>}
              <path className="chart-area" d={chartAreaPath} />
              <path className="chart-line" d={completeChartPath} />
              {chartCoordinates.filter((point) => !point.baseline).map((point, index) => <circle key={`${point.date.toISOString()}-${index}`} cx={point.x} cy={point.y} r="1.5" className="chart-point"><title>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(point.date)} · {formatPrice(point.price)}</title></circle>)}
              {hoveredPricePoint && <g className="chart-hover-point"><circle cx={hoveredPricePoint.x} cy={hoveredPricePoint.y} r="2.8" /><circle cx={hoveredPricePoint.x} cy={hoveredPricePoint.y} r="5" /></g>}
              {hoveredPricePoint && <g className="chart-tooltip" transform={`translate(${tooltipX} ${tooltipY})`}><rect width="76" height="15" rx="2" /><text x="3" y="6">{formatPrice(hoveredPricePoint.price)}</text><text x="3" y="11">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(hoveredPricePoint.date)}</text></g>}
            </svg>
          </div> : <div className="erp-empty-data">Ainda não há registros históricos de preço para este produto.</div>}
          {chartTimeLabels.length > 0 && <div className="erp-chart-time-labels"><span>{formatPriceTimeAxis(chartTimeLabels[0], priceRange)}</span><span>{formatPriceTimeAxis(chartTimeLabels[1], priceRange)}</span><span>{formatPriceTimeAxis(chartTimeLabels[2], priceRange)}</span></div>}
        </> : <div className="erp-empty-data">Cadastre um produto para iniciar o histórico.</div>}
      </section>

      <div className="erp-alert-grid"><div className="erp-alert-panel"><div className="erp-panel-title"><AlertTriangle size={17} /><div><h3>Atenção operacional</h3><p>Itens que precisam de ação hoje</p></div></div><div className="erp-empty-data">Nenhum alerta registrado.</div></div><div className="erp-alert-panel"><div className="erp-panel-title"><CalendarClock size={17} /><div><h3>Indicadores de operação</h3><p>Dados consolidados para decisão</p></div></div><div className="erp-empty-data">Sem dados operacionais suficientes.</div></div></div>

      <section className="erp-audit-panel"><div className="erp-panel-title"><Eye size={17} /><div><h3>Auditoria recente</h3><p>Quem alterou o quê e quando.</p></div></div>{selectedProduct?.priceHistory?.length ? [...selectedProduct.priceHistory].reverse().slice(0, 6).map((change) => <div className="erp-audit-row" key={`${change.date}-${change.price}`}><time>{new Date(change.date).toLocaleString('pt-BR')}</time><strong>{change.changedBy || 'sistema'}</strong><span>{selectedProduct.title}: R$ {Number(change.price).toFixed(2).replace('.', ',')}</span></div>) : <div className="erp-empty-data">Nenhuma alteração de valor registrada.</div>}</section>
    </div>
  );
}
