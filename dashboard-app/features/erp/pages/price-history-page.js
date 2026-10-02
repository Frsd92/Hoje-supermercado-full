'use client';

import Link from 'next/link';
import { ArrowUpRight, History, Package, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buildPriceChart, formatPriceAxis, formatPriceTimeAxis, getEffectiveRecordedPrice, getPriceHistorySyncStatus, PRICE_RANGES, priceChartY } from './price-chart.js';

const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function normalizeProductName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function formatPrice(value) {
  return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function formatPriceUpdate(date) {
  if (!date || Number.isNaN(date.getTime())) return 'Ainda não há registros de preço';
  const today = saoPauloDateFormatter.format(new Date()) === saoPauloDateFormatter.format(date);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
  if (today) return `Atualizado hoje, às ${time}`;
  const day = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date).replace('.', '');
  return `Último registro: ${day}, às ${time}`;
}

function formatHistoryDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function ERPPriceHistoryPage() {
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [priceRange, setPriceRange] = useState('1D');
  const [hoveredPriceIndex, setHoveredPriceIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const selectedProductIdRef = useRef('');

  useEffect(() => {
    let active = true;

    const loadProducts = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch('/api/products', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os produtos.');
        if (!Array.isArray(data.products)) throw new Error('Resposta inválida do catálogo.');
        if (!active) return;

        setProducts(data.products);
        const selected = data.products.find((product) => String(product.id) === selectedProductIdRef.current)
          || data.products.find((product) => Array.isArray(product.priceHistory) && product.priceHistory.length)
          || data.products[0];
        const selectedId = selected ? String(selected.id) : '';
        selectedProductIdRef.current = selectedId;
        setSelectedProductId(selectedId);
        setProductQuery(selected?.title || '');
      } catch (loadError) {
        if (!active) return;
        console.error('Não foi possível carregar o histórico de preços:', loadError);
        setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProducts();
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    setHoveredPriceIndex(null);
  }, [selectedProductId, priceRange]);

  const selectedProduct = products.find((product) => String(product.id) === selectedProductId);
  const historyRecords = (selectedProduct?.priceHistory || [])
    .filter((point) => !Number.isNaN(new Date(point.date).getTime()) && Number.isFinite(Number(point.price)))
    .map((point) => ({ ...point, date: new Date(point.date) }))
    .sort((first, second) => first.date - second.date);
  const chartHistory = historyRecords.filter((point, index) => (
    index === 0
    || getEffectiveRecordedPrice(point) !== getEffectiveRecordedPrice(historyRecords[index - 1])
  ));
  const chartData = buildPriceChart(chartHistory, priceRange);
  const chartCoordinates = chartData.points.map((point) => ({
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
  const priceSyncStatus = getPriceHistorySyncStatus(historyRecords, latestPrice);
  const hoveredPricePoint = hoveredPriceIndex === null ? null : chartCoordinates[hoveredPriceIndex] || null;
  const openingPrice = chartData.points[0]?.price ?? null;
  const displayedPrice = hoveredPricePoint?.price ?? latestPrice;
  const displayedDelta = openingPrice === null ? 0 : displayedPrice - Number(openingPrice);
  const displayedPercent = openingPrice ? (displayedDelta / Number(openingPrice)) * 100 : 0;
  const tooltipX = hoveredPricePoint ? Math.min(296, Math.max(35, hoveredPricePoint.x + 3)) : 0;
  const tooltipY = hoveredPricePoint ? Math.max(2, hoveredPricePoint.y - 20) : 0;
  const latestPriceDate = historyRecords.at(-1)?.date || null;
  const productsWithHistory = products.filter((product) => Array.isArray(product.priceHistory) && product.priceHistory.length).length;

  const handleProductQueryChange = (value) => {
    setProductQuery(value);
    const match = products.find((product) => normalizeProductName(product.title) === normalizeProductName(value));
    const selectedId = match ? String(match.id) : '';
    selectedProductIdRef.current = selectedId;
    setSelectedProductId(selectedId);
  };

  return (
    <div className="erp-module-page price-history-page">
      <div className="erp-customer-header price-history-header">
        <div>
          <span className="eyebrow">Catálogo e loja</span>
          <h1>Histórico de preços</h1>
          <p>Consulte as alterações registradas por produto, período e responsável.</p>
        </div>
        <div className="price-history-header-actions">
          <span className="price-history-coverage"><History size={16} /> {productsWithHistory} produto(s) com histórico</span>
          <Link href="/erp/products" className="price-history-products-link">Ver produtos <ArrowUpRight size={15} /></Link>
        </div>
      </div>

      <section className="price-history-toolbar" aria-label="Selecionar produto">
        <label htmlFor="price-history-product">
          <span>Pesquisar produto</span>
          <input
            id="price-history-product"
            type="search"
            list="price-history-product-options"
            value={productQuery}
            onChange={(event) => handleProductQueryChange(event.target.value)}
            placeholder="Digite o nome do produto"
            autoComplete="off"
            aria-describedby="price-history-product-help"
          />
          <datalist id="price-history-product-options">
            {products.map((product) => <option key={product.id} value={product.title} />)}
          </datalist>
          <small id="price-history-product-help">Escolha uma sugestão para abrir o histórico.</small>
        </label>
        <div className="price-history-selection">
          <span>Produto selecionado</span>
          <strong>{selectedProduct?.title || (loading ? 'Carregando produtos…' : 'Nenhum produto selecionado')}</strong>
          <small>{selectedProduct ? `${historyRecords.length} registro(s) • ${formatPriceUpdate(latestPriceDate)}` : 'Pesquise e escolha um produto.'}</small>
        </div>
        <button className="price-history-refresh" type="button" onClick={() => setRetry((count) => count + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'is-spinning' : ''} /> Atualizar
        </button>
      </section>

      {error && (
        <div className="price-history-error" role="alert">
          <span>Não foi possível carregar os dados do histórico.</span>
          <button type="button" onClick={() => setRetry((count) => count + 1)}>Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="erp-empty-data" role="status">Carregando histórico de preços…</div>
      ) : !products.length ? (
        <div className="price-history-empty">
          <Package size={26} />
          <strong>Nenhum produto cadastrado</strong>
          <span>Cadastre um produto para começar a registrar alterações de preço.</span>
          <Link href="/erp/catalog" className="primary-cta">Cadastrar produto</Link>
        </div>
      ) : !selectedProduct ? (
        <div className="erp-empty-data">Selecione um produto da lista para exibir o histórico.</div>
      ) : (
        <>
          <section className="erp-chart-panel price-history-chart-panel" aria-labelledby="price-history-chart-title">
            <div className="erp-table-heading">
              <div>
                <span className="eyebrow">Variação registrada</span>
                <h2 id="price-history-chart-title">{selectedProduct.title}</h2>
                <p>{historyRecords.length} registro(s) • {formatPriceUpdate(latestPriceDate)}</p>
              </div>
              <div className="price-history-current-price"><span>Preço atual</span><strong>{formatPrice(latestPrice)}</strong></div>
            </div>
            <div className="erp-chart-summary">
              <strong>{formatPrice(displayedPrice)}</strong>
              <span className={displayedDelta > 0 ? 'up' : displayedDelta < 0 ? 'down' : ''}>
                {displayedDelta > 0 ? <TrendingUp size={15} /> : displayedDelta < 0 ? <TrendingDown size={15} /> : null}
                {displayedPercent.toFixed(2).replace('.', ',')}%
              </span>
              <span className={`erp-chart-daily-change${displayedDelta > 0 ? ' up' : displayedDelta < 0 ? ' down' : ''}`}>
                {displayedDelta > 0 ? '+' : displayedDelta < 0 ? '−' : ''}{formatPrice(Math.abs(displayedDelta))} {priceRange === '1D' ? 'hoje' : 'no período'}
              </span>
            </div>
            {priceSyncStatus.status === 'mismatch' && <p className="erp-chart-data-warning" role="status">O preço atual ({formatPrice(priceSyncStatus.currentPrice)}) difere do último registro real ({formatPrice(priceSyncStatus.recordedPrice)}). O gráfico mantém apenas alterações registradas.</p>}
            {priceSyncStatus.status === 'missing' && <p className="erp-chart-data-warning" role="status">Este produto ainda não possui alterações de preço registradas. O gráfico não estima dados anteriores.</p>}
            {hoveredPricePoint && <p className="erp-chart-hover-date">{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(hoveredPricePoint.date)}</p>}
            <div className="erp-chart-ranges" role="group" aria-label="Filtrar período do gráfico">
              {PRICE_RANGES.map(({ id, label }) => <button type="button" key={id} aria-pressed={priceRange === id} className={priceRange === id ? 'active' : ''} onClick={() => setPriceRange(id)}>{label}</button>)}
            </div>
            {chartData.points.length ? <div className="erp-line-chart" onPointerMove={(event) => {
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
            </div> : <div className="erp-empty-data">Não há alterações de preço neste período.</div>}
            {chartTimeLabels.length > 0 && <div className="erp-chart-time-labels"><span>{formatPriceTimeAxis(chartTimeLabels[0], priceRange)}</span><span>{formatPriceTimeAxis(chartTimeLabels[1], priceRange)}</span><span>{formatPriceTimeAxis(chartTimeLabels[2], priceRange)}</span></div>}
          </section>

          <section className="erp-audit-panel price-history-records" aria-labelledby="price-history-records-title">
            <div className="erp-panel-title"><History size={17} /><div><h2 id="price-history-records-title">Registros do produto</h2><p>Valores gravados no ERP, sem projeções ou dados estimados.</p></div></div>
            {historyRecords.length ? <div className="price-history-table-scroll">
              <table className="price-history-table">
                <thead><tr><th>Data e hora</th><th>Preço base</th><th>Preço efetivo</th><th>Desconto</th><th>Alterado por</th></tr></thead>
                <tbody>{[...historyRecords].reverse().map((record, index) => {
                  const discount = Number(record.discount) || 0;
                  return <tr key={`${record.date.toISOString()}-${index}`}>
                    <td>{formatHistoryDate(record.date)}</td>
                    <td>{formatPrice(record.price)}</td>
                    <td><strong>{formatPrice(getEffectiveRecordedPrice(record))}</strong></td>
                    <td>{discount > 0 ? `${discount}%` : '—'}</td>
                    <td>{record.changedBy || 'Sistema'}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div> : <div className="erp-empty-data">Nenhum registro histórico disponível para este produto.</div>}
          </section>
        </>
      )}
    </div>
  );
}
