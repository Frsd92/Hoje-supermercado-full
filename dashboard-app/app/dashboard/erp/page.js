'use client';

import { AlertTriangle, Boxes, CalendarClock, CircleDollarSign, Eye, FilePlus2, Filter, Pencil, Search, Trash2, TrendingUp, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export default function ERPPage() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const deleteProduct = async (product) => {
    if (!window.confirm(`Excluir o produto "${product.title}"? Esta ação não pode ser desfeita.`)) return;
    const response = await fetch('/api/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: product.id }) });
    const data = await response.json();
    if (!response.ok) return setFeedback(data.error || 'Não foi possível excluir o produto.');
    setProducts((current) => current.filter((item) => item.id !== product.id));
    setSelectedProductId((current) => current === product.id ? '' : current);
    setFeedback('Produto excluído com sucesso.');
  };
  useEffect(() => {
    let active = true;
    const loadDashboardData = async () => {
      try {
        const [productsResponse, ordersResponse, customersResponse] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/erp/orders'),
          fetch('/api/erp/customers'),
        ]);
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

  const categories = ['Todos', ...new Set(products.flatMap((product) => product.categories || []))];
  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesQuery = `${product.title} ${product.brand || ''} ${product.id}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (category === 'Todos' || product.categories?.includes(category));
  }), [products, query, category]);
  const selectedProduct = products.find((product) => product.id === selectedProductId) || filteredProducts[0];
  const priceHistory = selectedProduct?.priceHistory || [];
  const chartPoints = priceHistory.length > 1 ? priceHistory : selectedProduct ? [{ date: selectedProduct.createdAt, price: selectedProduct.price }, { date: new Date().toISOString(), price: selectedProduct.price }] : [];
  const chartMin = chartPoints.length ? Math.min(...chartPoints.map((point) => Number(point.price) || 0)) : 0;
  const chartMax = chartPoints.length ? Math.max(...chartPoints.map((point) => Number(point.price) || 0)) : 1;
  const chartRange = chartMax - chartMin || 1;
  const chartPath = chartPoints.map((point, index) => {
    const x = chartPoints.length === 1 ? 50 : (index / (chartPoints.length - 1)) * 100;
    const y = 92 - (((Number(point.price) || 0) - chartMin) / chartRange) * 78;
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const latestPrice = Number(selectedProduct?.price || 0);
  const firstPrice = Number(chartPoints[0]?.price || latestPrice);
  const priceDelta = firstPrice ? ((latestPrice - firstPrice) / firstPrice) * 100 : 0;

  const metrics = [
    { label: 'Faturamento no mês', value: metricsLoading ? '...' : `R$ ${monthlyRevenue.toFixed(2).replace('.', ',')}`, detail: `${monthOrders.length} pedido(s) no mês atual`, icon: CircleDollarSign, tone: 'green' },
    { label: 'Margem média', value: metricsLoading ? '...' : `${averageMargin.toFixed(1).replace('.', ',')}%`, detail: monthlyRevenue ? 'Calculada sobre vendas e custos' : 'Sem vendas no mês atual', icon: TrendingUp, tone: 'gold' },
    { label: 'Produtos ativos', value: products.length, detail: 'Produtos cadastrados no ERP', icon: Boxes, tone: 'blue' },
    { label: 'Clientes ativos', value: metricsLoading ? '...' : customers.filter((customer) => customer.status === 'Ativo').length, detail: `${customers.length} cliente(s) identificado(s)`, icon: Users, tone: 'violet' },
  ];

  return (
    <div className="section-shell erp-page">
      <div className="section-header erp-header">
        <div><span className="eyebrow">Centro de Operações</span><h1>ERP Dashboard</h1><p>Visão integrada de produtos, estoque, vendas, margem e auditoria.</p></div>
        <button type="button" className="primary-cta" onClick={() => setIsFormOpen((current) => !current)}><FilePlus2 size={16} /> Novo produto</button>
      </div>

      <div className="erp-metrics-grid">{metrics.map(({ label, value, detail, icon: Icon, tone }) => <div key={label} className={`erp-metric ${tone}`}><div className="erp-metric-icon"><Icon size={18} /></div><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>)}</div>

      {isFormOpen && <div className="erp-product-form"><div><h3>Novo produto</h3><p>O cadastro cria um registro operacional para estoque, preço e auditoria.</p></div><a href="/erp/products" className="primary-cta">Abrir cadastro completo</a></div>}

      <section className="erp-chart-panel"><div className="erp-table-heading"><div><span className="eyebrow">Mercado do catálogo</span><h3>Histórico de preço</h3><p>Cada alteração registrada no editor aparece nesta série do produto.</p></div><select value={selectedProduct?.id || ''} onChange={(event) => setSelectedProductId(event.target.value)} aria-label="Selecionar produto do gráfico"><option value="">Selecione um produto</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></div>{selectedProduct ? <><div className="erp-chart-summary"><strong>R$ {latestPrice.toFixed(2).replace('.', ',')}</strong><span className={priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : ''}>{priceDelta > 0 ? '+' : ''}{priceDelta.toFixed(2).replace('.', ',')}%</span><small>{selectedProduct.title} · {chartPoints.length} registro(s)</small></div><div className="erp-line-chart"><svg viewBox="0 0 100 100" role="img" aria-label={`Histórico de preço de ${selectedProduct.title}`} preserveAspectRatio="none"><path className="chart-grid-line" d="M 0 92 H 100 M 0 53 H 100 M 0 14 H 100" /><path className="chart-area" d={`${chartPath} L 100 100 L 0 100 Z`} /><path className="chart-line" d={chartPath} />{chartPoints.map((point, index) => { const x = chartPoints.length === 1 ? 50 : (index / (chartPoints.length - 1)) * 100; const y = 92 - (((Number(point.price) || 0) - chartMin) / chartRange) * 78; return <circle key={`${point.date}-${index}`} cx={x} cy={y} r="1.5" className="chart-point"><title>{new Date(point.date).toLocaleString('pt-BR')} · R$ {Number(point.price).toFixed(2).replace('.', ',')}</title></circle>; })}</svg></div></> : <div className="erp-empty-data">Cadastre um produto para iniciar o histórico.</div>}</section>

      <div className="erp-alert-grid"><div className="erp-alert-panel"><div className="erp-panel-title"><AlertTriangle size={17} /><div><h3>Atenção operacional</h3><p>Itens que precisam de ação hoje</p></div></div><div className="erp-empty-data">Nenhum alerta registrado.</div></div><div className="erp-alert-panel"><div className="erp-panel-title"><CalendarClock size={17} /><div><h3>Indicadores de operação</h3><p>Dados consolidados para decisão</p></div></div><div className="erp-empty-data">Sem dados operacionais suficientes.</div></div></div>

      <section className="erp-table-panel"><div className="erp-table-heading"><div><h3>Catálogo operacional</h3><p>SKU, estoque, custo, venda e rastreabilidade por fornecedor.</p></div><div className="erp-table-tools"><div className="erp-search"><Search size={15} /><input placeholder="Buscar produto ou SKU" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="Todos">Todas categorias</option>{categories.filter((item) => item !== 'Todos').map((item) => <option key={item}>{item}</option>)}</select><Filter size={16} /></div></div><div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Produto / SKU</th><th>Categorias principais</th><th>Estoque</th><th>Custo médio</th><th>Venda</th><th>Margem</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredProducts.map((product) => <tr key={product.id} onClick={() => setSelectedProductId(product.id)} className={selectedProduct?.id === product.id ? 'is-selected' : ''}><td><strong>{product.title}</strong><small>{product.id} · {product.brand || 'Sem marca'}</small></td><td>{product.categories?.join(', ')}</td><td><strong>{product.quantity || 0}</strong><small>{product.subcategory || 'Sem subcategoria'}</small></td><td>R$ {Number(product.cost || 0).toFixed(2).replace('.', ',')}</td><td>R$ {Number(product.price || 0).toFixed(2).replace('.', ',')}</td><td>{product.price ? Math.round(((product.price - product.cost) / product.price) * 100) : 0}%</td><td><span className={`erp-status ${product.status.toLowerCase().replaceAll(' ', '-')}`}>{product.status}</span></td><td><span className="erp-row-actions"><a href={`/erp/products?edit=${encodeURIComponent(product.id)}`} className="editor-link" aria-label={`Editar ${product.title}`}><Pencil size={15} /> Editar</a><button type="button" className="editor-delete" aria-label={`Excluir ${product.title}`} onClick={(event) => { event.stopPropagation(); deleteProduct(product); }}><Trash2 size={15} /></button></span></td></tr>)}</tbody></table></div></section>

      <section className="erp-audit-panel"><div className="erp-panel-title"><Eye size={17} /><div><h3>Auditoria recente</h3><p>Quem alterou o quê e quando.</p></div></div>{selectedProduct?.priceHistory?.length ? [...selectedProduct.priceHistory].reverse().slice(0, 6).map((change) => <div className="erp-audit-row" key={`${change.date}-${change.price}`}><time>{new Date(change.date).toLocaleString('pt-BR')}</time><strong>{change.changedBy || 'sistema'}</strong><span>{selectedProduct.title}: R$ {Number(change.price).toFixed(2).replace('.', ',')}</span></div>) : <div className="erp-empty-data">Nenhuma alteração de valor registrada.</div>}</section>
      {feedback && <div className="erp-feedback">{feedback}</div>}
    </div>
  );
}
