'use client';

import Link from 'next/link';
import { ArrowDownToLine, Banknote, CalendarDays, CircleDollarSign, PackageSearch, RefreshCw, ShoppingBag, Tag, TicketPercent, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const saopauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function money(value) {
  return value === null || value === undefined ? '—' : currencyFormatter.format(Number(value) || 0);
}

function percent(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(date);
}

function formatPeriodDate(value) {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? formatDate(`${value}T12:00:00-03:00`)
    : formatDate(value);
}

function getLocalDateKey(date) {
  const parts = Object.fromEntries(saopauloDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function createChartPoints(values) {
  const points = values.slice(-12);
  if (points.length < 2 || !points.some((value) => Number.isFinite(value))) return '';
  const numericValues = points.map((value) => Number.isFinite(value) ? value : null);
  const availableValues = numericValues.filter((value) => value !== null);
  const min = Math.min(0, ...availableValues);
  const max = Math.max(0, ...availableValues);
  const range = Math.max(max - min, 1);
  return numericValues.map((value, index) => {
    const x = points.length === 1 ? 50 : 3 + (index / (points.length - 1)) * 94;
    const y = value === null ? null : 27 - ((value - min) / range) * 22;
    return y === null ? '' : `${x.toFixed(1)},${y.toFixed(1)}`;
  }).filter(Boolean).join(' ');
}

function MetricChart({ values, label, color = 'green' }) {
  const points = createChartPoints(values);
  if (!points || !values.some((value) => Number.isFinite(value) && value !== 0)) return null;
  return <svg
    className={`financial-metric-chart ${color}`}
    viewBox="0 0 100 32"
    role="img"
    aria-label={label}
    focusable="false"
  >
    <polyline points={points} />
  </svg>;
}

function MetricCard({ icon: Icon, label, value, detail, chartValues = [], chartLabel, emphasis = false }) {
  return <article className={`financial-metric${emphasis ? ' emphasis' : ''}`}>
    <span className="financial-metric-icon"><Icon size={18} aria-hidden="true" /></span>
    <span className="financial-metric-label">{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
    <MetricChart values={chartValues} label={chartLabel} />
  </article>;
}

function EmptyState({ children }) {
  return <p className="financial-empty" role="status">{children}</p>;
}

function FinancialTrend({ trend, granularity }) {
  if (!trend.length) return <EmptyState>Não há pedidos no período selecionado.</EmptyState>;
  const maxRevenue = Math.max(...trend.map((entry) => entry.revenue), 1);

  return <>
    <div className="financial-trend" role="list" aria-label={`Faturamento por ${granularity === 'day' ? 'dia' : 'mês'}`}>
      {trend.map((entry) => (
        <div className="financial-trend-item" role="listitem" key={entry.key}>
          <span>{money(entry.revenue)}</span>
          <div className="financial-trend-track" aria-hidden="true">
            <i style={{ height: `${Math.max((entry.revenue / maxRevenue) * 100, 3)}%` }} />
          </div>
          <small>{entry.label}</small>
        </div>
      ))}
    </div>
    <p className="financial-source-note">A série mostra faturamento líquido por {granularity === 'day' ? 'dia' : 'mês'}; os indicadores do topo consideram todo o período selecionado.</p>
  </>;
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportFinancialCsv(data, liquidity) {
  const rows = [
    ['Relatório financeiro Hoje Supermercado'],
    ['Período', data.period.allHistory ? 'Todo o histórico disponível' : `${data.period.startDate || 'início'} até ${data.period.endDate || 'hoje'}`],
    ['Primeiro pedido disponível', formatDate(data.period.firstOrderDate)],
    [],
    ['Resumo', 'Valor'],
    ['Faturamento líquido', money(data.totals.revenue)],
    ['Pedidos', data.totals.orders],
    ['Ticket médio', money(data.totals.averageTicket)],
    ['CMV', money(data.totals.costOfGoodsSold)],
    ['Lucro bruto', money(data.totals.grossProfit)],
    ['Margem bruta', percent(data.totals.grossMargin)],
    ['Descontos registrados', money(data.totals.discounts)],
    [],
    ['DRE gerencial preliminar', 'Valor'],
    ['Vendas após descontos e antes de estornos', money(data.dre.salesBeforeRefunds)],
    ['(-) Estornos confirmados', money(-data.dre.refunds)],
    ['Receita líquida após estornos', money(data.dre.netRevenue)],
    ['(-) CMV', money(data.dre.costOfGoodsSold === null ? null : -data.dre.costOfGoodsSold)],
    ['Lucro bruto', money(data.dre.grossProfit)],
    ['Despesas operacionais, impostos e resultado líquido', 'Não apurados no ERP'],
    [],
    ['Contas a pagar de NF-e lançadas'],
    ['Saldo em aberto', money(liquidity?.outstanding)],
    ['Saldo vencido', money(liquidity?.overdue)],
    ['Vencimento nos próximos 30 dias', money(liquidity?.dueNext30Days)],
    ['Pago neste mês', money(liquidity?.paidThisMonth)],
    [],
    ['Promoções por tipo', 'Pedidos', 'Itens', 'Faturamento associado', 'Desconto de item', 'Lucro bruto', 'Margem bruta'],
    ...data.promotionTypes.map((item) => [item.label, item.orders, item.itemCount, money(item.revenue), money(item.promotionDiscount), money(item.grossProfit), percent(item.grossMargin)]),
    [],
    ['Combinações de descontos', 'Pedidos', 'Unidades', 'Desconto em itens', 'Desconto em cupons', 'Outro desconto no pedido', 'Descontos totais', 'Valor líquido cobrado', 'CMV', 'Lucro após CMV', 'Margem'],
    ...data.discountCombinations.map((item) => [item.label, item.orders, item.quantity, money(item.itemPromotionDiscount), money(item.couponDiscount), money(item.otherOrderDiscount), money(item.totalDiscount), money(item.revenue), money(item.costOfGoodsSold), money(item.grossProfit), percent(item.grossMargin)]),
    [],
    ['Rastreador por pedido (até 50 mais recentes)', 'Data', 'Descontos aplicados', 'Subtotal após promoções de item', 'Desconto em itens', 'Desconto em cupom', 'Outro desconto no pedido', 'Descontos totais', 'Valor líquido cobrado', 'CMV conhecido', 'Lucro após CMV', 'Margem'],
    ...data.discountOrders.map((item) => [
      item.id,
      formatDate(item.createdAt),
      item.discountBreakdown.map((discount) => `${discount.label}: ${money(discount.amount)}`).join(' | '),
      money(item.subtotal),
      money(item.itemPromotionDiscount),
      money(item.couponDiscount),
      money(item.otherOrderDiscount),
      money(item.totalDiscount),
      money(item.netRevenue),
      money(item.costOfGoodsSold ?? item.knownCostOfGoodsSold),
      money(item.grossProfit),
      percent(item.grossMargin),
    ]),
    [],
    ['Produtos por faturamento', 'Pedidos', 'Unidades', 'Faturamento', 'CMV conhecido', 'Lucro bruto', 'Margem bruta'],
    ...data.products.map((item) => [item.title, item.orders, item.quantity, money(item.revenue), money(item.knownCost), money(item.grossProfit), percent(item.grossMargin)]),
    [],
    ['Candidatos a produto-isca', 'Pedidos com produto', 'Cestas com complemento', 'Taxa de associação', 'Lucro bruto do item', 'Faturamento dos demais itens'],
    ...data.lossLeaders.map((item) => [item.title, item.orders, item.attachedOrders, percent(item.attachRate), money(item.grossProfit), money(item.associatedRevenue)]),
    [],
    ['Cupons', 'Pedidos', 'Clientes na primeira compra', 'Clientes recorrentes', 'Desconto', 'Faturamento associado', 'Lucro bruto'],
    ...data.coupons.map((item) => [item.code, item.orders, item.newCustomers, item.returningCustomers, money(item.discount), money(item.revenue), money(item.grossProfit)]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'financeiro-hoje-supermercado.csv';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PeriodFilters({ preset, setPreset, startDate, endDate, setStartDate, setEndDate, onApply }) {
  const [formError, setFormError] = useState('');
  const selectPreset = (nextPreset) => {
    setFormError('');
    setPreset(nextPreset);
    const today = getLocalDateKey(new Date());
    if (nextPreset === 'all') {
      onApply('', '');
    } else if (nextPreset === '30d') {
      onApply(shiftDate(today, -29), today);
    } else if (nextPreset === '90d') {
      onApply(shiftDate(today, -89), today);
    } else if (nextPreset === 'year') {
      onApply(`${today.slice(0, 4)}-01-01`, today);
    }
  };

  const submitCustomPeriod = (event) => {
    event.preventDefault();
    if (startDate && endDate && startDate > endDate) {
      setFormError('A data inicial precisa ser anterior ou igual à data final.');
      return;
    }
    setFormError('');
    onApply(startDate, endDate);
  };

  return <section className="financial-filters" aria-label="Filtros do relatório financeiro">
    <div className="financial-period-presets" role="group" aria-label="Período rápido">
      {[
        ['all', 'Todo o histórico'],
        ['30d', '30 dias'],
        ['90d', '90 dias'],
        ['year', 'Este ano'],
        ['custom', 'Personalizado'],
      ].map(([key, label]) => <button
        key={key}
        type="button"
        className={preset === key ? 'active' : ''}
        aria-pressed={preset === key}
        onClick={() => selectPreset(key)}
      >{label}</button>)}
    </div>
    {preset === 'custom' && <form className="financial-custom-period" onSubmit={submitCustomPeriod}>
      <label>Data inicial<input type="date" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
      <label>Data final<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
      <button type="submit">Aplicar período</button>
      {formError && <p role="alert">{formError}</p>}
    </form>}
  </section>;
}

export default function FinancialPage() {
  const [data, setData] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState({ startDate: '', endDate: '' });
  const [preset, setPreset] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refundSyncWarning, setRefundSyncWarning] = useState(false);
  const [dreMode, setDreMode] = useState('managerial');
  const [liquidity, setLiquidity] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        let syncWarning = false;
        try {
          const syncResponse = await fetch('/api/erp/refunds/reconcile', { method: 'POST', cache: 'no-store' });
          const syncData = await syncResponse.json();
          syncWarning = !syncResponse.ok || syncData.warning === true;
        } catch (syncError) {
          console.error('Não foi possível reconciliar estornos antes de atualizar o financeiro:', syncError);
          syncWarning = true;
        }
        const params = new URLSearchParams();
        if (appliedPeriod.startDate) params.set('startDate', appliedPeriod.startDate);
        if (appliedPeriod.endDate) params.set('endDate', appliedPeriod.endDate);
        const query = params.toString();
        const response = await fetch(`/api/erp/financeiro${query ? `?${query}` : ''}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os indicadores financeiros.');
        if (!result.financial || !Array.isArray(result.financial.promotionTypes) || !result.liquidity) {
          throw new Error('A resposta do financeiro veio incompleta. Tente atualizar a página.');
        }
        if (active) {
          setData(result.financial);
          setLiquidity(result.liquidity);
          setRefundSyncWarning(syncWarning);
        }
      } catch (loadError) {
        if (active && loadError.name !== 'AbortError') {
          setError(loadError.message || 'Não foi possível carregar os indicadores financeiros. Tente novamente.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [appliedPeriod, refreshToken]);

  const applyPeriod = (nextStartDate, nextEndDate) => {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setData(null);
    setAppliedPeriod({ startDate: nextStartDate, endDate: nextEndDate });
  };

  const periodLabel = data?.period.allHistory
    ? `Todo o histórico desde ${formatDate(data.period.firstOrderDate)}`
    : `${formatPeriodDate(data?.period.startDate) || 'Início do histórico'} a ${formatPeriodDate(data?.period.endDate) || formatDate(new Date())}`;
  const hasFinancialOrders = Boolean(data?.period.orders);
  const hasPromotionCoverageGap = Boolean(data?.totals.items)
    && data.coverage.promotionCoveragePercent !== 100;
  const trendRows = data?.trend || [];
  const trendLabel = data?.trendGranularity === 'day' ? 'diário' : 'mensal';
  const chartValues = (key) => trendRows.map((entry) => entry[key]);
  const chartDescription = (label) => `${label} ${trendLabel} no período selecionado`;
  const knownLiquidity = Boolean(liquidity);

  return <div className="erp-page financial-page">
    <header className="financial-header">
      <div>
        <span className="eyebrow">Gestão financeira</span>
        <h1>Financeiro</h1>
        <p>Visão gerencial organizada em três pilares, com dados de vendas, custos registrados e contas a pagar.</p>
      </div>
      <div className="financial-header-actions">
        <Link href="/erp/orders">Pedidos</Link>
        <Link href="/erp/promotions">Cupons</Link>
        <Link href="/erp/flash-offers">Ofertas</Link>
        <button type="button" onClick={() => setRefreshToken((token) => token + 1)} disabled={loading} aria-label="Atualizar indicadores financeiros">
          <RefreshCw size={15} className={loading ? 'is-spinning' : ''} aria-hidden="true" />Atualizar
        </button>
        <button type="button" onClick={() => data && exportFinancialCsv(data, liquidity)} disabled={!data} aria-label="Exportar indicadores financeiros para CSV">
          <ArrowDownToLine size={15} aria-hidden="true" />Exportar CSV
        </button>
      </div>
    </header>

    <PeriodFilters
      preset={preset}
      setPreset={setPreset}
      startDate={startDate}
      endDate={endDate}
      setStartDate={setStartDate}
      setEndDate={setEndDate}
      onApply={applyPeriod}
    />

    {loading && <p className="financial-loading" role="status">{data ? 'Atualizando indicadores…' : 'Carregando dados financeiros…'}</p>}
    {error && <div className="financial-error" role="alert">
      <span>{error}{data ? ' Os dados mostrados são da última consulta concluída.' : ''}</span>
      <button type="button" onClick={() => setRefreshToken((token) => token + 1)} disabled={loading}>Tentar novamente</button>
    </div>}
    {refundSyncWarning && <div className="financial-data-notice" role="status"><p>Alguns estornos não puderam ser confirmados agora. Os valores do período podem estar temporariamente desatualizados; atualize novamente em instantes.</p></div>}
    {!data && !loading && !error && <EmptyState>Nenhum dado financeiro disponível.</EmptyState>}
    {data && <>
      <div className="financial-period-summary">
        <CalendarDays size={15} aria-hidden="true" />
        <span>{periodLabel}</span>
        <strong>{data.period.orders.toLocaleString('pt-BR')} pedido(s)</strong>
      </div>

      {((hasFinancialOrders && !data.totals.marginAvailable) || hasPromotionCoverageGap || data.coverage.unreconciledOrders > 0) && <div className="financial-data-notice" role="status">
        {hasFinancialOrders && !data.totals.marginAvailable && <p>
          Margem bruta completa indisponível: {data.coverage.missingCostItems} item(ns) sem custo, {data.coverage.ordersWithoutItems} pedido(s) sem itens, {data.coverage.invalidOrders} pedido(s) com valor inválido, {data.coverage.invalidItems} item(ns) inválido(s) e {data.coverage.unreconciledOrders} pedido(s) sem conciliação. Custos parciais não são tratados como zero.
        </p>}
        {hasPromotionCoverageGap && <p>
          Tipo promocional registrado em {percent(data.coverage.promotionCoveragePercent)} dos itens; pedidos antigos sem marcador ficam como “Não rastreado”, não como venda sem promoção.
        </p>}
        {data.coverage.unreconciledOrders > 0 && <p>Há pedidos cujos itens e total não conciliam; eles permanecem no faturamento, mas não na margem completa.</p>}
      </div>}

      <nav className="financial-pillar-nav" aria-label="Navegação pelos pilares financeiros">
        <a href="#financial-operational">1 · Eficiência operacional</a>
        <a href="#financial-liquidity">2 · Liquidez e tesouraria</a>
        <a href="#financial-value">3 · Valor e rentabilidade</a>
      </nav>

      <section className="financial-metrics" aria-label="Indicadores principais; gráficos mostram a evolução no período selecionado">
        <MetricCard icon={Banknote} label="Faturamento líquido" value={money(data.totals.revenue)} detail="Vendas registradas menos estornos confirmados" chartValues={chartValues('revenue')} chartLabel={chartDescription('Faturamento líquido')} emphasis />
        <MetricCard icon={CircleDollarSign} label="Lucro bruto" value={money(data.totals.grossProfit)} detail="Receita líquida menos CMV; antes das despesas" chartValues={chartValues('grossProfit')} chartLabel={chartDescription('Lucro bruto')} />
        <MetricCard icon={TrendingUp} label="Margem bruta real" value={percent(data.totals.grossMargin)} detail="Após descontos, estornos e custo por item vendido" chartValues={chartValues('grossMargin')} chartLabel={chartDescription('Margem bruta')} />
        <MetricCard icon={PackageSearch} label={data.totals.costOfGoodsSold === null ? 'CMV conhecido' : 'CMV'} value={money(data.totals.costOfGoodsSold ?? data.totals.knownCostOfGoodsSold)} detail={data.totals.costOfGoodsSold === null ? `${data.coverage.knownCostItems} de ${data.totals.items} itens com custo` : 'Custo dos produtos vendidos'} chartValues={chartValues('knownCostOfGoodsSold')} chartLabel={chartDescription('CMV conhecido')} />
        <MetricCard icon={Tag} label="Descontos registrados" value={money(data.totals.discounts)} detail="Descontos em itens e no pedido" chartValues={chartValues('discounts')} chartLabel={chartDescription('Descontos registrados')} />
        <MetricCard icon={ShoppingBag} label="Ticket médio" value={money(data.totals.averageTicket)} detail={`${data.totals.orders.toLocaleString('pt-BR')} pedido(s) no período`} chartValues={chartValues('averageTicket')} chartLabel={chartDescription('Ticket médio')} />
      </section>

      <section className="financial-panel" id="financial-operational" aria-labelledby="financial-dre-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Pilar 1 · Eficiência, giro e margem</span><h2 id="financial-dre-title">Demonstração do Resultado (DRE)</h2></div>
          <div className="financial-mode-switch" role="group" aria-label="Modelo da demonstração de resultado">
            <button type="button" aria-pressed={dreMode === 'managerial'} onClick={() => setDreMode('managerial')}>Gerencial</button>
            <button type="button" aria-pressed={dreMode === 'official'} onClick={() => setDreMode('official')}>Oficial</button>
          </div>
        </div>
        {dreMode === 'managerial' ? <>
          <p className="financial-explainer">DRE gerencial preliminar baseada nos pedidos e no custo histórico salvo nos itens. Valores refletem o período filtrado; despesas não cadastradas não são presumidas como zero.</p>
          <div className="financial-dre-layout">
            <div className="financial-table-scroll" role="region" aria-label="DRE gerencial preliminar" tabIndex={0}>
              <table>
                <caption>Apuração operacional; esta demonstração não substitui a escrituração contábil oficial</caption>
                <thead><tr><th scope="col">Linha do resultado</th><th scope="col">Valor</th><th scope="col">Base</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Vendas após descontos, antes de estornos</th><td>{money(data.dre.salesBeforeRefunds)}</td><td>Totais dos pedidos elegíveis após descontos</td></tr>
                  <tr><th scope="row">(-) Estornos confirmados</th><td className="financial-negative">{money(-data.dre.refunds)}</td><td>Confirmação registrada na Pagar.me</td></tr>
                  <tr className="financial-dre-total"><th scope="row">(=) Receita líquida após estornos</th><td>{money(data.dre.netRevenue)}</td><td>Vendas menos estornos confirmados</td></tr>
                  <tr><th scope="row">(-) CMV</th><td>{data.dre.costOfGoodsSold === null ? 'Não apurado integralmente' : money(-data.dre.costOfGoodsSold)}</td><td>{data.dre.costOfGoodsSold === null ? `${data.coverage.knownCostItems} de ${data.totals.items} itens com custo` : 'Custo registrado nos itens vendidos'}</td></tr>
                  <tr className="financial-dre-total"><th scope="row">(=) Lucro bruto</th><td>{money(data.dre.grossProfit)}</td><td>Receita líquida menos CMV completo</td></tr>
                  <tr><th scope="row">(-) Despesas operacionais, tributos e taxas</th><td>Não apurado</td><td>Não há lançamentos completos destas despesas</td></tr>
                  <tr><th scope="row">(=) EBITDA / resultado líquido</th><td>Não apurado</td><td>Depende das despesas, impostos e depreciação contabilizados</td></tr>
                </tbody>
              </table>
            </div>
            <div className="financial-dre-chart" role="img" aria-label={`Composição do resultado: receita líquida ${money(data.dre.netRevenue)}, CMV ${money(data.dre.costOfGoodsSold)}, lucro bruto ${money(data.dre.grossProfit)}`}>
              <span>Composição da receita</span>
              <div><i style={{ width: `${data.dre.netRevenue > 0 ? 100 : 0}%` }} /><label>Receita líquida <strong>{money(data.dre.netRevenue)}</strong></label></div>
              <div><i className="cost" style={{ width: `${data.dre.costOfGoodsSold !== null && data.dre.netRevenue > 0 ? Math.min(100, Math.max(0, data.dre.costOfGoodsSold / data.dre.netRevenue * 100)) : 0}%` }} /><label>CMV completo <strong>{money(data.dre.costOfGoodsSold)}</strong></label></div>
              <div><i className="profit" style={{ width: `${data.dre.grossProfit !== null && data.dre.netRevenue > 0 ? Math.min(100, Math.max(0, data.dre.grossProfit / data.dre.netRevenue * 100)) : 0}%` }} /><label>Lucro bruto <strong>{money(data.dre.grossProfit)}</strong></label></div>
              <small>Escala relativa à receita líquida. Quando o CMV está incompleto, a composição não estima o lucro.</small>
            </div>
          </div>
          <p className="financial-source-note">Ponto de equilíbrio, EBITDA completo, margem de contribuição após custos variáveis, ciclo operacional e PME não são calculados sem despesas, folha, taxas, saldos de caixa e datas completas de recebimento/baixa de estoque.</p>
        </> : <div className="financial-official-notice" role="status">
          <strong>DRE oficial indisponível — não é um relatório fiscal/contábil.</strong>
          <p>O sistema ainda não reúne plano de contas, regime de competência, tributos apurados, despesas contabilizadas, folha, depreciação, juros e encerramento contábil. O painel não produz nem substitui uma demonstração oficial assinada por profissional habilitado.</p>
          <Link href="/erp/suppliers/invoices">Consultar notas fiscais e contas a pagar registradas</Link>
        </div>}
      </section>

      <section className="financial-panel" id="financial-liquidity" aria-labelledby="financial-liquidity-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Pilar 2 · Fôlego, caixa e tesouraria</span><h2 id="financial-liquidity-title">Liquidez registrada no ERP</h2></div>
          <Link href="/erp/suppliers/invoices">Notas fiscais e parcelas a pagar</Link>
        </div>
        <p className="financial-explainer">Visão das parcelas de NF-e já lançadas. Não representa saldo bancário nem fluxo de caixa completo: recebimentos de adquirentes e extratos ainda não são conciliados automaticamente.</p>
        {knownLiquidity ? <div className="financial-liquidity-grid">
          <article><span>Contas a pagar em aberto</span><strong>{money(liquidity.outstanding)}</strong><small>{liquidity.openCount} parcela(s) de NF-e lançada(s)</small><MetricChart values={[liquidity.openByDueDate.overdue, liquidity.openByDueDate.dueNext30Days, liquidity.openByDueDate.dueLaterOrUnscheduled]} label="Distribuição do saldo em aberto por faixa de vencimento" color="blue" /></article>
          <article><span>Parcelas vencidas</span><strong>{money(liquidity.overdue)}</strong><small>Saldo vencido sem baixa registrada</small><div className="financial-liquidity-breakdown" role="img" aria-label={`Saldo vencido ${money(liquidity.overdue)}, próximos 30 dias ${money(liquidity.dueNext30Days)}, depois ou sem vencimento ${money(liquidity.dueLaterOrUnscheduled)}`}>
            {[
              ['Vencidas', liquidity.openByDueDate.overdue, 'overdue'],
              ['Próx. 30 dias', liquidity.openByDueDate.dueNext30Days, 'upcoming'],
              ['Depois/sem data', liquidity.openByDueDate.dueLaterOrUnscheduled, 'later'],
            ].map(([label, value, key]) => <span key={key}><i className={key} style={{ width: `${liquidity.outstanding > 0 ? value / liquidity.outstanding * 100 : 0}%` }} /><small>{label} · {money(value)}</small></span>)}
          </div></article>
          <article><span>Pagamentos a fornecedores neste mês</span><strong>{money(liquidity.paidThisMonth)}</strong><small>{liquidity.paidCountThisMonth} parcela(s) marcada(s) como paga(s)</small><MetricChart values={liquidity.paidTrend.map((entry) => entry.paid)} label="Pagamentos registrados a fornecedores nos últimos seis meses" color="blue" /></article>
        </div> : <EmptyState>Resumo de contas a pagar indisponível.</EmptyState>}
      </section>

      <section className="financial-panel" aria-labelledby="financial-trend-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Vendas</span><h2 id="financial-trend-title">Evolução do faturamento</h2></div>
          <span>{data.trendGranularity === 'day' ? 'Por dia' : 'Por mês'}</span>
        </div>
        <FinancialTrend trend={data.trend} granularity={data.trendGranularity} />
      </section>

      <section className="financial-panel" aria-labelledby="financial-promotions-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Promoções</span><h2 id="financial-promotions-title">Qual tipo vende mais?</h2></div>
          {data.bestSellingPromotion && <span className="financial-best-promotion"><TrendingUp size={14} aria-hidden="true" />{data.bestSellingPromotion.label} · {money(data.bestSellingPromotion.revenue)}</span>}
        </div>
        {data.promotionTypes.length ? <div className="financial-table-scroll" role="region" aria-label="Vendas por tipo de promoção" tabIndex={0}>
          <table>
            <caption>Faturamento associado, itens, descontos e margem por tipo registrado</caption>
            <thead><tr><th scope="col">Tipo registrado</th><th scope="col">Pedidos</th><th scope="col">Itens</th><th scope="col">Faturamento</th><th scope="col">Desconto no item</th><th scope="col">Lucro bruto</th><th scope="col">Margem</th></tr></thead>
            <tbody>{data.promotionTypes.map((promotion) => <tr key={promotion.key}>
              <th scope="row">{promotion.label}{promotion.key === 'unclassified' && <small>Histórico sem classificação</small>}</th>
              <td>{promotion.orders}</td>
              <td>{promotion.itemCount}</td>
              <td>{money(promotion.revenue)}</td>
              <td>{money(promotion.promotionDiscount)}</td>
              <td>{money(promotion.grossProfit)}</td>
              <td>{percent(promotion.grossMargin)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Ainda não há itens vendidos no período.</EmptyState>}
        <p className="financial-source-note">Pedidos podem combinar promoção de item e cupom. O faturamento associado a cada tipo é comparativo e não deve ser somado como se fossem grupos exclusivos.</p>
      </section>

      <section className="financial-panel" aria-labelledby="financial-discount-combinations-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Rastreador de descontos</span><h2 id="financial-discount-combinations-title">Combinações aplicadas e resultado</h2></div>
          {data.bestSellingDiscount && <span className="financial-best-promotion"><TrendingUp size={14} aria-hidden="true" />Mais comprada: {data.bestSellingDiscount.label} · {data.bestSellingDiscount.orders} pedido(s)</span>}
        </div>
        <p className="financial-explainer">O valor líquido é o total cobrado depois dos descontos. O lucro após CMV subtrai o custo registrado dos itens; não inclui taxas de pagamento, impostos, frete ou outras despesas que não estejam registradas.</p>
        {data.discountCombinations.length ? <div className="financial-table-scroll" role="region" aria-label="Resultado por combinação de descontos" tabIndex={0}>
          <table>
            <caption>Combinações exclusivas por pedido, ordenadas pelo número de compras; “Não rastreado” identifica histórico sem classificação</caption>
            <thead><tr><th scope="col">Combinação aplicada</th><th scope="col">Pedidos</th><th scope="col">Unidades</th><th scope="col">Desconto nos itens</th><th scope="col">Desconto em cupons</th><th scope="col">Outro desconto no pedido</th><th scope="col">Descontos totais</th><th scope="col">Valor líquido</th><th scope="col">CMV</th><th scope="col">Lucro após CMV</th><th scope="col">Margem</th></tr></thead>
            <tbody>{data.discountCombinations.map((combination) => <tr key={combination.key}>
              <th scope="row">{combination.label}</th>
              <td>{combination.orders}</td>
              <td>{combination.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
              <td>{money(combination.itemPromotionDiscount)}</td>
              <td>{money(combination.couponDiscount)}</td>
              <td>{money(combination.otherOrderDiscount)}</td>
              <td>{money(combination.totalDiscount)}</td>
              <td>{money(combination.revenue)}</td>
              <td>{combination.costOfGoodsSold === null ? `${money(combination.knownCostOfGoodsSold)} parcial` : money(combination.costOfGoodsSold)}</td>
              <td className={combination.grossProfit !== null && combination.grossProfit < 0 ? 'financial-negative' : ''}>{money(combination.grossProfit)}</td>
              <td>{percent(combination.grossMargin)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Nenhum pedido disponível para comparar combinações de descontos.</EmptyState>}
        <p className="financial-source-note">As combinações permitem comparar compras com promoção, cupom e descontos acumulados. O resultado por desconto não prova causalidade; custos ou valores sem conciliação ficam sem lucro estimado.</p>
      </section>

      <section className="financial-panel" aria-labelledby="financial-discount-orders-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Conferência pedido a pedido</span><h2 id="financial-discount-orders-title">Descontos e valor final cobrado</h2></div>
          <span>Até 50 pedidos mais recentes com desconto</span>
        </div>
        {data.discountOrders.length ? <div className="financial-table-scroll" role="region" aria-label="Rastreamento de descontos e resultado por pedido" tabIndex={0}>
          <table>
            <caption>Valores registrados no pedido; subtotal após descontos de item, antes de cupom ou desconto no pedido</caption>
            <thead><tr><th scope="col">Pedido / data</th><th scope="col">Descontos aplicados</th><th scope="col">Subtotal após promoções</th><th scope="col">Desconto nos itens</th><th scope="col">Desconto em cupom</th><th scope="col">Outro desconto no pedido</th><th scope="col">Descontos totais</th><th scope="col">Valor líquido cobrado</th><th scope="col">CMV conhecido</th><th scope="col">Lucro após CMV</th><th scope="col">Margem</th></tr></thead>
            <tbody>{data.discountOrders.map((order) => <tr key={order.id}>
              <th scope="row">{order.id}<small>{formatDate(order.createdAt)}</small></th>
              <td>{order.discountBreakdown.map((discount) => `${discount.label}: ${money(discount.amount)}`).join(' · ') || '—'}</td>
              <td>{money(order.subtotal)}</td>
              <td>{money(order.itemPromotionDiscount)}</td>
              <td>{money(order.couponDiscount)}</td>
              <td>{money(order.otherOrderDiscount)}</td>
              <td>{money(order.totalDiscount)}</td>
              <td>{money(order.netRevenue)}</td>
              <td>{order.costOfGoodsSold === null ? `${money(order.knownCostOfGoodsSold)} parcial` : money(order.costOfGoodsSold)}</td>
              <td className={order.grossProfit !== null && order.grossProfit < 0 ? 'financial-negative' : ''}>{money(order.grossProfit)}</td>
              <td>{percent(order.grossMargin)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Nenhum pedido com desconto registrado neste período.</EmptyState>}
      </section>

      <section className="financial-panel" aria-labelledby="financial-loss-leaders-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Cestas de compra</span><h2 id="financial-loss-leaders-title">Candidatos a produto-isca</h2></div>
          <span>Margem nula ou negativa com itens complementares</span>
        </div>
        <p className="financial-explainer">Associação de produtos na mesma cesta não prova que um item causou a compra dos outros. São candidatos para análise, calculados somente quando o custo de todos os itens do produto é conhecido.</p>
        {data.lossLeaders.length ? <div className="financial-table-scroll" role="region" aria-label="Produtos de margem nula ou negativa e compras associadas" tabIndex={0}>
          <table>
            <caption>Produtos com margem bruta não positiva e compras de outros itens na mesma cesta</caption>
            <thead><tr><th scope="col">Produto</th><th scope="col">Pedidos</th><th scope="col">Com complemento</th><th scope="col">Taxa de associação</th><th scope="col">Lucro bruto do produto</th><th scope="col">Faturamento dos demais itens</th><th scope="col">Mais comprados junto</th></tr></thead>
            <tbody>{data.lossLeaders.map((product) => <tr key={product.id}>
              <th scope="row">{product.title}</th>
              <td>{product.orders}</td>
              <td>{product.attachedOrders}</td>
              <td>{percent(product.attachRate)}</td>
              <td className={product.grossProfit < 0 ? 'financial-negative' : ''}>{money(product.grossProfit)}</td>
              <td>{money(product.associatedRevenue)}</td>
              <td>{product.coProducts.map((item) => `${item.title} (${item.orders})`).join(', ') || '—'}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Nenhum produto com margem nula ou negativa e compras complementares identificadas com custo completo.</EmptyState>}
      </section>

      <section className="financial-panel" id="financial-value" aria-labelledby="financial-products-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Pilar 3 · Patrimônio, retorno e estratégia</span><h2 id="financial-products-title">Rentabilidade por produto</h2></div>
          <span>Até 30 maiores faturamentos do período</span>
        </div>
        <p className="financial-explainer">O custo por item permite analisar a margem bruta de produtos. ROI, ROIC, ROE, EVA e valuation exigem balanço patrimonial, capital investido e despesas/retornos de projetos, dados que ainda não são registrados de forma suficiente para apuração.</p>
        {data.products.length ? <div className="financial-table-scroll" role="region" aria-label="Margem bruta por produto" tabIndex={0}>
          <table>
            <caption>Receita líquida e margem bruta por produto usando o custo registrado no pedido</caption>
            <thead><tr><th scope="col">Produto</th><th scope="col">Pedidos</th><th scope="col">Unidades</th><th scope="col">Faturamento</th><th scope="col">CMV conhecido</th><th scope="col">Lucro bruto</th><th scope="col">Margem</th></tr></thead>
            <tbody>{data.products.map((product) => <tr key={product.productId || product.title}>
              <th scope="row">{product.title}</th>
              <td>{product.orders}</td>
              <td>{product.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
              <td>{money(product.revenue)}</td>
              <td>{product.costOfGoodsSold === null ? `${money(product.knownCost)} parcial` : money(product.costOfGoodsSold)}</td>
              <td className={product.grossProfit !== null && product.grossProfit < 0 ? 'financial-negative' : ''}>{money(product.grossProfit)}</td>
              <td>{percent(product.grossMargin)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Não há produtos vendidos no período.</EmptyState>}
      </section>

      <section className="financial-panel" aria-labelledby="financial-coupons-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Aquisição e retenção</span><h2 id="financial-coupons-title">Resultado dos cupons</h2></div>
          <span><TicketPercent size={15} aria-hidden="true" />{data.couponSummary.orders} pedido(s) com cupom</span>
        </div>
        <div className="financial-coupon-summary">
          <div><strong>{data.couponSummary.newCustomers}</strong><span>Clientes na 1ª compra registrada</span></div>
          <div><strong>{data.couponSummary.returningCustomers}</strong><span>Clientes com compra anterior</span></div>
          <div><strong>{money(data.couponSummary.discount)}</strong><span>Desconto concedido em cupons</span></div>
          <div><strong>{money(data.couponSummary.grossProfit)}</strong><span>Lucro bruto associado, se completo</span></div>
        </div>
        {data.coupons.length ? <div className="financial-table-scroll" role="region" aria-label="Desempenho e tipo de cliente por cupom" tabIndex={0}>
          <table>
            <caption>Clientes por cupom classificados pelo histórico de pedidos anteriores à utilização</caption>
            <thead><tr><th scope="col">Cupom</th><th scope="col">Destinatários</th><th scope="col">Pedidos</th><th scope="col">1ª compra</th><th scope="col">Já compravam</th><th scope="col">Desconto</th><th scope="col">Faturamento associado</th><th scope="col">Lucro bruto</th></tr></thead>
            <tbody>{data.coupons.map((coupon) => <tr key={coupon.code}>
              <th scope="row">{coupon.code}{!coupon.campaignExists && <small>Campanha não localizada</small>}</th>
              <td>{coupon.recipients || '—'}</td>
              <td>{coupon.orders}</td>
              <td>{coupon.newCustomers}</td>
              <td>{coupon.returningCustomers}</td>
              <td>{money(coupon.discount)}</td>
              <td>{money(coupon.revenue)}</td>
              <td>{money(coupon.grossProfit)}</td>
            </tr>)}</tbody>
          </table>
        </div> : <EmptyState>Nenhum pedido com cupom registrado no período.</EmptyState>}
        <p className="financial-explainer">“1ª compra registrada” e “já compravam” são uma aproximação baseada no histórico do banco. Sem grupo de controle, a métrica não prova que o cupom trouxe o cliente novo nem que o cliente recorrente compraria sem desconto.</p>
      </section>

      <footer className="financial-disclaimer">
        <TrendingDown size={16} aria-hidden="true" />
        <p>Este painel calcula margem bruta real a partir do custo salvo em cada item vendido. Não representa lucro líquido: despesas fixas, taxas de pagamento, impostos, frete e devoluções só podem ser incluídos quando registrados no ERP.</p>
      </footer>
    </>}
  </div>;
}
