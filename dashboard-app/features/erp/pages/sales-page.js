'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, RefreshCw, Search, ShoppingBag } from 'lucide-react';
import { formatSaleDateTime, isSaleDateInRange } from '@/features/erp/api/sales-date-utils';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const paymentLabels = {
  pix: 'Pix',
  cartao: 'Cartão',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  vale_alimentacao: 'Vale-alimentação',
  vale_refeicao: 'Vale-refeição',
  dinheiro: 'Dinheiro',
  outro: 'Outro / combinar',
  nao_informado: 'Não informado',
};
const paymentStatusLabels = {
  pending: 'Pendente',
  paid: 'Faturado',
  failed: 'Recusado',
  canceled: 'Cancelado',
  partially_refunded: 'Estorno parcial',
  refunded: 'Estornado',
  manual: 'Pagamento combinado',
};

function money(value) {
  return currencyFormatter.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

function downloadCsv(sales) {
  const rows = [
    ['Pedido', 'Cliente', 'Data e horário', 'Forma de pagamento', 'Status', 'Total (R$)'],
    ...sales.map((sale) => [
      sale.id,
      sale.customerName || 'Cliente',
      formatSaleDateTime(sale.createdAt),
      paymentLabels[sale.paymentMethod] || sale.paymentMethod || 'Não informado',
      paymentStatusLabels[sale.paymentStatus] || 'Não informado',
      Number(sale.total).toFixed(2).replace('.', ','),
    ]),
  ];
  const content = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'vendas-erp.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export default function SalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/erp/sales', { cache: 'no-store', signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as vendas.');
        if (!Array.isArray(result.sales)) throw new Error('A resposta de vendas está inválida.');
        setSales(result.sales);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Não foi possível carregar as vendas.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [refreshToken]);

  const salesInPeriod = useMemo(
    () => sales.filter((sale) => isSaleDateInRange(sale.createdAt, startDate, endDate)),
    [sales, startDate, endDate],
  );
  const filteredSales = useMemo(() => salesInPeriod.filter((sale) => {
    const matchesQuery = `${sale.id} ${sale.customerName || ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'));
    return matchesQuery && (filter === 'all' || sale.paymentStatus === filter);
  }), [filter, salesInPeriod, search]);
  const paidSales = salesInPeriod.filter((sale) => sale.paymentStatus === 'paid');
  const pendingSales = salesInPeriod.filter((sale) => ['pending', 'manual'].includes(sale.paymentStatus));
  const paidTotal = paidSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const pendingTotal = pendingSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  return <section className="sales-page" aria-labelledby="sales-page-title">
    <header className="sales-page-header">
      <div>
        <span className="eyebrow">Comercial · faturamento</span>
        <h1 id="sales-page-title">Vendas</h1>
        <p>Consulte os pedidos de venda, formas de pagamento e valores faturados. Uma venda só aparece como faturada após a confirmação do pagamento.</p>
      </div>
      <div className="sales-page-actions">
        <Link href="/erp/orders">Abrir operação de pedidos</Link>
        <button type="button" onClick={() => downloadCsv(filteredSales)} disabled={!filteredSales.length}><ArrowDownToLine size={15} aria-hidden="true" />Exportar CSV</button>
        <button type="button" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading}><RefreshCw size={15} aria-hidden="true" />Atualizar</button>
      </div>
    </header>

    {error && <div className="financial-error" role="alert"><span>{error}</span><button type="button" onClick={() => setRefreshToken((value) => value + 1)}>Tentar novamente</button></div>}

    <div className="sales-page-summary" aria-label="Resumo das vendas">
      <article><span>Pedidos registrados</span><strong>{salesInPeriod.length}</strong><small>{startDate || endDate ? 'No período selecionado' : 'Últimos 500 pedidos'}</small></article>
      <article><span>Faturamento confirmado</span><strong>{money(paidTotal)}</strong><small>{paidSales.length} pagamento(s) confirmado(s)</small></article>
      <article><span>Aguardando pagamento</span><strong>{money(pendingTotal)}</strong><small>{pendingSales.length} pedido(s) pendente(s) ou combinado(s)</small></article>
    </div>

    <section className="financial-panel sales-page-panel" aria-labelledby="sales-table-title">
      <div className="financial-section-heading">
        <div><span className="eyebrow">Pedidos de venda</span><h2 id="sales-table-title">Vendas e faturamento</h2></div>
        <span>{filteredSales.length} resultado(s)</span>
      </div>
      <div className="sales-page-toolbar">
        <label><Search size={16} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pedido ou cliente" /></label>
        <div className="sales-page-filter-controls">
          <div className="sales-page-date-filter" role="group" aria-label="Filtrar por período">
            <label>De<input type="date" aria-label="Data inicial" value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} /></label>
            <span aria-hidden="true">até</span>
            <label>Até<input type="date" aria-label="Data final" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label>
            {(startDate || endDate) && <button type="button" className="sales-page-clear-date" onClick={() => { setStartDate(''); setEndDate(''); }}>Limpar período</button>}
          </div>
          <select aria-label="Filtrar vendas por pagamento" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">Todos os pagamentos</option>
            <option value="paid">Faturado</option>
            <option value="pending">Pendente</option>
            <option value="manual">Pagamento combinado</option>
            <option value="failed">Recusado</option>
            <option value="canceled">Cancelado</option>
            <option value="partially_refunded">Estorno parcial</option>
            <option value="refunded">Estornado</option>
          </select>
        </div>
      </div>
      {loading && <p className="financial-loading" role="status">Carregando vendas…</p>}
      {!loading && <div className="financial-record-table-wrap sales-page-table-wrap" role="region" aria-label="Tabela de vendas" tabIndex={0}>
        <table>
          <caption>Pedidos mais recentes, data e horário, forma de pagamento e valor total</caption>
          <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Data e horário</th><th scope="col">Forma de pagamento</th><th scope="col">Status</th><th scope="col">Total (R$)</th></tr></thead>
          <tbody>{filteredSales.map((sale) => <tr key={sale.id}>
            <th scope="row"><Link href="/erp/orders"><ShoppingBag size={14} aria-hidden="true" />{sale.id}</Link></th>
            <td>{sale.customerName || 'Cliente não identificado'}</td>
            <td><time dateTime={sale.createdAt}>{formatSaleDateTime(sale.createdAt)}</time></td>
            <td>{paymentLabels[sale.paymentMethod] || sale.paymentMethod || 'Não informado'}</td>
            <td><span className={`sales-status sales-status-${sale.paymentStatus || 'unknown'}`}>{paymentStatusLabels[sale.paymentStatus] || 'Não informado'}</span></td>
            <td>{money(sale.total)}</td>
          </tr>)}</tbody>
        </table>
        {!filteredSales.length && <div className="sales-page-empty"><ShoppingBag size={20} aria-hidden="true" /><p>{sales.length ? 'Nenhuma venda corresponde aos filtros.' : 'Ainda não há pedidos de venda registrados.'}</p></div>}
      </div>}
    </section>
  </section>;
}
