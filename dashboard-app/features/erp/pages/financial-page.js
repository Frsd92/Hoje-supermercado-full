'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowDownToLine, Banknote, CalendarDays, CircleDollarSign, PackageSearch, RefreshCw, ShoppingBag, Tag, TicketPercent, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { parseChartAccountsCsv } from '@/features/erp/api/financial-csv';

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const financialScreenLabels = {
  home: 'Início',
  dre: 'DRE',
  'fluxo-de-caixa': 'Fluxo de Caixa',
  despesas: 'Despesas, contas e vencimentos',
  'mostradores-financeiro': 'Mostradores Financeiro',
  'mostradores-contador': 'Mostradores Contador',
};
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

function formatDateOnly(value) {
  if (!value) return '—';
  const key = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return formatPeriodDate(key);
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
    ['Faturamento líquido', money(data.dre.netRevenue)],
    ['Pedidos financeiros', data.dre.orders],
    ['Ticket médio líquido', money(data.dre.orders ? data.dre.netRevenue / data.dre.orders : 0)],
    ['CMV', money(data.totals.costOfGoodsSold)],
    ['Lucro bruto', money(data.totals.grossProfit)],
    ['Margem bruta', percent(data.totals.grossMargin)],
    ['Descontos registrados', money(data.totals.discounts)],
    ['Despesas cadastradas por competência', money(data.expenses.total)],
    ['Despesas pagas', money(data.expenses.paidAmount)],
    ['Despesas em aberto', money(data.expenses.openAmount)],
    ['Resultado após despesas registradas', money(data.dre.operatingResult)],
    ...data.expenses.byAccount.map((item) => [`Despesa · ${item.code} ${item.name}`, money(item.amount)]),
    [],
    ['DRE gerencial preliminar', 'Valor'],
    ['Vendas após descontos e antes de estornos', money(data.dre.salesBeforeRefunds)],
    ['(-) Estornos confirmados', money(-data.dre.refunds)],
    ['Receita líquida após estornos', money(data.dre.netRevenue)],
    ['(-) CMV', money(data.dre.costOfGoodsSold === null ? null : -data.dre.costOfGoodsSold)],
    ['Lucro bruto', money(data.dre.grossProfit)],
    ['(-) Despesas cadastradas no período', money(-data.dre.operatingExpenses)],
    ['Resultado após despesas registradas', money(data.dre.operatingResult)],
    ['EBITDA / resultado líquido oficial', 'Não apurados no ERP'],
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

function daysUntil(value) {
  if (!value) return null;
  const dueDate = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return Math.round((Date.parse(`${dueDate}T00:00:00.000Z`) - Date.parse(`${getLocalDateKey(new Date())}T00:00:00.000Z`)) / 86400000);
}

function FinancialRecords({ ledger, onSaved }) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [importingChart, setImportingChart] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState('');
  const [processingExpense, setProcessingExpense] = useState('');
  const [selectedAccounts, setSelectedAccounts] = useState({});
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    competenceAt: getLocalDateKey(new Date()),
    dueAt: '',
    categoryId: '',
    notes: '',
  });
  const [chartForm, setChartForm] = useState({
    code: '',
    name: '',
    nature: 'EXPENSE',
    expenseBehavior: 'FIXED',
  });
  const [accountForm, setAccountForm] = useState({
    name: '',
    institution: '',
    accountType: 'BANK',
    openingBalance: '0.00',
    balanceAsOf: getLocalDateKey(new Date()),
  });

  const send = async (event, body, onSuccess) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/financeiro/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar o cadastro.');
      onSuccess();
      setNotice('Cadastro salvo.');
      await onSaved();
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar o cadastro.');
    } finally {
      setSaving(false);
    }
  };

  const updateExpense = async (expense, action) => {
    const financialAccountId = selectedAccounts[expense.id] || '';
    if (action === 'pay' && !financialAccountId) {
      setError('Selecione a conta da empresa usada para o pagamento.');
      return;
    }
    if (action === 'cancel' && !window.confirm(`Cancelar o lançamento "${expense.description}"?`)) return;
    setProcessingExpense(expense.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/financeiro/records', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseId: expense.id, action, financialAccountId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a despesa.');
      setNotice(action === 'pay' ? 'Pagamento registrado.' : 'Despesa cancelada.');
      await onSaved();
    } catch (updateError) {
      setError(updateError.message || 'Não foi possível atualizar a despesa.');
    } finally {
      setProcessingExpense('');
    }
  };

  const importChartAccounts = async (csvContent) => {
    setImportingChart(true);
    setError('');
    setNotice('');
    try {
      const accounts = parseChartAccountsCsv(await csvContent);
      const response = await fetch('/api/erp/financeiro/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'chartAccountsImport', accounts }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível importar o plano de contas.');
      setNotice(`Importação concluída: ${result.createdCount} conta(s) adicionada(s); ${result.skippedCount} já existia(m) e foi/foram preservada(s).`);
      await onSaved();
    } catch (importError) {
      setError(importError.message || 'Não foi possível importar o plano de contas.');
    } finally {
      setImportingChart(false);
    }
  };

  const importChartCsv = (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('O CSV não pode ultrapassar 1 MB.');
      return;
    }
    importChartAccounts(file.text());
  };

  const importProvidedChart = async () => {
    const csvContent = fetch('/dados/plano-contas-hoje.csv', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Não foi possível carregar o CSV do plano Hoje.');
      return response.text();
    });
    await importChartAccounts(csvContent);
  };

  const removeFinancialAccount = async (account) => {
    if (!window.confirm(`Excluir a conta "${account.name}"? Se houver despesas vinculadas, ela será desativada para preservar o histórico.`)) return;
    setDeletingAccount(account.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/financeiro/records', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ financialAccountId: account.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível excluir a conta.');
      setNotice(result.archived
        ? 'A conta possui despesas vinculadas e foi desativada para preservar o histórico.'
        : 'Conta da empresa excluída.');
      await onSaved();
    } catch (deleteError) {
      setError(deleteError.message || 'Não foi possível excluir a conta.');
    } finally {
      setDeletingAccount('');
    }
  };

  const activeChartAccounts = ledger.chartAccounts.filter((account) => account.active
    && account.nature === 'EXPENSE'
    && !ledger.chartAccounts.some((child) => child.active && child.code.startsWith(`${account.code}.`)));
  const activeFinancialAccounts = ledger.financialAccounts.filter((account) => account.active);
  return <section className="financial-panel" id="financial-records" aria-labelledby="financial-records-title">
    <div className="financial-section-heading">
      <div><span className="eyebrow">Lançamentos registrados</span><h2 id="financial-records-title">Despesas, contas e vencimentos</h2></div>
      <a href="/erp/suppliers/invoices">NF-e e contas de fornecedores</a>
    </div>
    <p className="financial-explainer">Despesas manuais entram no DRE pela competência. Saldos de contas são snapshots informados por você; não são conciliados automaticamente com vendas ou extratos bancários.</p>
    {(error || notice) && <p className={`financial-record-message${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}

    <div className="financial-record-summary" aria-label="Resumo dos vencimentos cadastrados">
      <article><span>Despesas em aberto</span><strong>{money(ledger.dueSummary.openAmount)}</strong><small>{ledger.dueSummary.openCount} lançamento(s) não pagos</small></article>
      <article><span>Vencidas</span><strong>{ledger.dueSummary.overdueCount}</strong><small>Precisam de acompanhamento</small></article>
      <article><span>Vencem hoje</span><strong>{ledger.dueSummary.dueTodayCount}</strong><small>Despesas com vencimento cadastrado</small></article>
      <article><span>Próximos 7 dias</span><strong>{ledger.dueSummary.dueNextSevenDays}</strong><small>Contagem baseada na data de vencimento</small></article>
    </div>

    <div className="financial-record-forms">
      <form className="financial-record-form" onSubmit={(event) => send(event, { kind: 'expense', ...expenseForm }, () => setExpenseForm({
        description: '',
        amount: '',
        competenceAt: getLocalDateKey(new Date()),
        dueAt: '',
        categoryId: '',
        notes: '',
      }))}>
        <h3>Lançar gasto da empresa</h3>
        <label>Descrição<input required maxLength={180} value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} /></label>
        <div className="financial-record-form-row">
          <label>Valor (R$)<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} /></label>
          <label>Competência<input required type="date" value={expenseForm.competenceAt} onChange={(event) => setExpenseForm({ ...expenseForm, competenceAt: event.target.value })} /></label>
        </div>
        <div className="financial-record-form-row">
          <label>Vencimento<input type="date" value={expenseForm.dueAt} onChange={(event) => setExpenseForm({ ...expenseForm, dueAt: event.target.value })} /></label>
          <label>Conta do plano<select required value={expenseForm.categoryId} onChange={(event) => setExpenseForm({ ...expenseForm, categoryId: event.target.value })}>
            <option value="">Selecione uma conta</option>
            {activeChartAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
          </select></label>
        </div>
        <label>Observação (opcional)<input maxLength={1000} value={expenseForm.notes} onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })} /></label>
        <button type="submit" disabled={saving || !activeChartAccounts.length}>{saving ? 'Salvando…' : 'Registrar despesa'}</button>
        {!activeChartAccounts.length && <small>Cadastre uma conta de despesa no plano de contas para lançar gastos.</small>}
      </form>

      <form className="financial-record-form" onSubmit={(event) => send(event, { kind: 'financialAccount', ...accountForm }, () => setAccountForm({
        name: '',
        institution: '',
        accountType: 'BANK',
        openingBalance: '0.00',
        balanceAsOf: getLocalDateKey(new Date()),
      }))}>
        <h3>Cadastrar conta da empresa</h3>
        <label>Nome para identificação<input required maxLength={120} placeholder="Ex.: Conta operacional" value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></label>
        <label>Banco ou instituição (opcional)<input maxLength={120} value={accountForm.institution} onChange={(event) => setAccountForm({ ...accountForm, institution: event.target.value })} /></label>
        <div className="financial-record-form-row">
          <label>Tipo<select value={accountForm.accountType} onChange={(event) => setAccountForm({ ...accountForm, accountType: event.target.value })}>
            <option value="BANK">Conta bancária</option><option value="DIGITAL">Conta digital</option><option value="CASH">Caixa físico</option>
          </select></label>
          <label>Saldo informado (R$)<input required type="number" step="0.01" value={accountForm.openingBalance} onChange={(event) => setAccountForm({ ...accountForm, openingBalance: event.target.value })} /></label>
        </div>
        <label>Saldo referente a<input required type="date" value={accountForm.balanceAsOf} onChange={(event) => setAccountForm({ ...accountForm, balanceAsOf: event.target.value })} /></label>
        <button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar conta'}</button>
      </form>

      <form className="financial-record-form" onSubmit={(event) => send(event, { kind: 'chartAccount', ...chartForm }, () => setChartForm({
        code: '',
        name: '',
        nature: 'EXPENSE',
        expenseBehavior: 'FIXED',
      }))}>
        <h3>Criar conta no plano contábil</h3>
        <div className="financial-record-form-row">
          <label>Código<input required maxLength={30} placeholder="Ex.: 4.1.01" value={chartForm.code} onChange={(event) => setChartForm({ ...chartForm, code: event.target.value })} /></label>
          <label>Natureza<select value={chartForm.nature} onChange={(event) => setChartForm({ ...chartForm, nature: event.target.value })}>
            <option value="EXPENSE">Despesa</option><option value="REVENUE">Receita</option><option value="ASSET">Ativo</option><option value="LIABILITY">Passivo</option><option value="EQUITY">Patrimônio líquido</option>
          </select></label>
        </div>
        <label>Nome da conta<input required maxLength={120} placeholder="Ex.: Aluguel" value={chartForm.name} onChange={(event) => setChartForm({ ...chartForm, name: event.target.value })} /></label>
        {chartForm.nature === 'EXPENSE' && <label>Comportamento da despesa<select value={chartForm.expenseBehavior} onChange={(event) => setChartForm({ ...chartForm, expenseBehavior: event.target.value })}>
          <option value="FIXED">Fixa</option><option value="VARIABLE">Variável</option><option value="FINANCIAL">Financeira</option><option value="TAX">Tributos</option><option value="OTHER">Outra</option>
        </select></label>}
        <button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Adicionar ao plano'}</button>
        <div className="financial-chart-import">
          <button type="button" onClick={importProvidedChart} disabled={importingChart}>
            {importingChart ? 'Importando…' : 'Importar plano Hoje do PDF (180 contas)'}
          </button>
          <label>Importar plano de contas CSV<input type="file" accept=".csv,text/csv" onChange={importChartCsv} disabled={importingChart} /></label>
          <a href="/dados/plano-contas-hoje.csv" download>Baixar CSV do plano Hoje (PDF)</a>
          <small>{importingChart ? 'Validando e importando contas…' : 'Códigos e nomes vêm do PDF. Natureza e comportamento são sugestões; valide com seu contador. Até 500 contas por arquivo.'}</small>
        </div>
      </form>
    </div>

    <div className="financial-record-lists">
      <div>
        <h3>Contas cadastradas</h3>
        {ledger.financialAccounts.length ? <ul className="financial-account-list">{ledger.financialAccounts.map((account) => <li key={account.id}>
          <strong>{account.name}</strong><span>{account.institution || 'Instituição não informada'} · {account.accountType === 'CASH' ? 'Caixa' : account.accountType === 'DIGITAL' ? 'Digital' : 'Bancária'}</span>
          <small>Saldo informado: {money(account.openingBalance)} em {formatDateOnly(account.balanceAsOf)}</small>
          {!account.active && <small>Inativa</small>}
          <button type="button" className="financial-record-delete" onClick={() => removeFinancialAccount(account)} disabled={deletingAccount === account.id}>
            {deletingAccount === account.id ? 'Excluindo…' : 'Excluir conta'}
          </button>
        </li>)}</ul> : <EmptyState>Nenhuma conta financeira cadastrada.</EmptyState>}
      </div>
      <div>
        <h3>Plano de contas</h3>
        {ledger.chartAccounts.length ? <ul className="financial-account-list">{ledger.chartAccounts.map((account) => <li key={account.id}>
          <strong>{account.code} · {account.name}</strong>
          <span>{account.nature === 'EXPENSE' ? `Despesa ${account.expenseBehavior === 'FIXED' ? 'fixa' : account.expenseBehavior === 'VARIABLE' ? 'variável' : account.expenseBehavior === 'FINANCIAL' ? 'financeira' : account.expenseBehavior === 'TAX' ? 'tributária' : 'diversa'}` : account.nature === 'REVENUE' ? 'Receita' : account.nature === 'ASSET' ? 'Ativo' : account.nature === 'LIABILITY' ? 'Passivo' : 'Patrimônio líquido'}</span>
          {!account.active && <small>Inativa</small>}
        </li>)}</ul> : <EmptyState>Nenhuma conta contábil cadastrada.</EmptyState>}
      </div>
    </div>

    <div className="financial-record-table-wrap" role="region" aria-label="Despesas registradas e seus vencimentos" tabIndex={0}>
      <table>
        <caption>Despesas gerenciais registradas; vencimentos exibem dias corridos restantes ou de atraso</caption>
        <thead><tr><th scope="col">Despesa / conta</th><th scope="col">Competência</th><th scope="col">Valor</th><th scope="col">Vencimento</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead>
        <tbody>{ledger.expenses.map((expense) => {
          const days = daysUntil(expense.dueAt);
          const countdown = days === null ? 'Sem vencimento cadastrado'
            : days < 0 ? `Vencida há ${Math.abs(days)} dia(s)`
              : days === 0 ? 'Vence hoje' : `Vence em ${days} dia(s)`;
          return <tr key={expense.id}>
            <th scope="row">{expense.description}<small>{expense.category?.code} · {expense.category?.name}</small></th>
            <td>{formatDateOnly(expense.competenceAt)}</td>
            <td>{money(expense.amount)}</td>
            <td>{expense.dueAt ? <>{formatDateOnly(expense.dueAt)}<small>{countdown}</small></> : countdown}</td>
            <td>{expense.status === 'Paga' ? `Paga${expense.financialAccount?.name ? ` · ${expense.financialAccount.name}` : ''}` : expense.status}</td>
            <td>{expense.status === 'Em aberto' ? <div className="financial-record-actions">
              <label className="visually-hidden" htmlFor={`expense-account-${expense.id}`}>Conta usada no pagamento de {expense.description}</label>
              <select id={`expense-account-${expense.id}`} value={selectedAccounts[expense.id] || ''} onChange={(event) => setSelectedAccounts({ ...selectedAccounts, [expense.id]: event.target.value })}>
                <option value="">Conta do pagamento</option>
                {activeFinancialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <button type="button" onClick={() => updateExpense(expense, 'pay')} disabled={processingExpense === expense.id || !activeFinancialAccounts.length}>Marcar paga</button>
              <button type="button" className="danger" onClick={() => updateExpense(expense, 'cancel')} disabled={processingExpense === expense.id}>Cancelar</button>
            </div> : <span>—</span>}</td>
          </tr>;
        })}</tbody>
      </table>
      {!ledger.expenses.length && <EmptyState>Nenhuma despesa foi lançada. Cadastre uma despesa para iniciar o controle.</EmptyState>}
    </div>
  </section>;
}

const indicatorStatusLabels = {
  available: 'Dado registrado',
  partial: 'Parcial / cobertura limitada',
  unavailable: 'Sem base suficiente',
};

function buildPillarIndicators(data, liquidity, ledger) {
  const cmv = data.dre.costOfGoodsSold;
  const grossProfit = data.dre.grossProfit;
  const accountCount = ledger.financialAccounts.filter((account) => account.active).length;
  const expenseAmount = money(data.expenses.total);
  const supplierOpen = money(liquidity.outstanding);
  const paidCompanyExpenses = money(data.expenses.paidAmount);
  const expenseCount = data.expenses.count;
  const itemsWithCost = `${data.coverage.knownCostItems} de ${data.totals.items}`;
  const productsEvaluated = data.products.length;

  return {
    operational: [
      {
        name: 'DRE (oficial vs. gerencial)',
        accounting: 'Apuração legal por competência e escrituração fiscal.',
        accountingValue: 'Não escriturada neste ERP',
        finance: `Vendas líquidas ${money(data.dre.netRevenue)}; despesas cadastradas ${expenseAmount}; CMV ${money(cmv)}.`,
        financeValue: data.dre.operatingResult === null ? 'Resultado não apurado por CMV incompleto' : `Resultado após despesas cadastradas: ${money(data.dre.operatingResult)}`,
        financeAmount: data.dre.operatingResult,
        financeUnit: 'currency',
        financeAmountLabel: 'Resultado gerencial com custos conhecidos e despesas cadastradas',
        chartValues: data.trend.map((entry) => entry.grossProfit === null ? null : entry.grossProfit - entry.operatingExpenses),
        chartLabel: 'Resultado após despesas registradas por período',
        status: 'partial',
      },
      {
        name: 'Margem de contribuição',
        accounting: 'Base fiscal de custos e valorização de estoque.',
        accountingValue: 'Não apurada por contabilidade',
        finance: `Lucro bruto registrado: ${money(grossProfit)}; despesas variáveis lançadas: ${money(data.expenses.variable)}. Custos variáveis podem estar incompletos.`,
        financeValue: grossProfit === null ? 'Sem margem bruta completa' : `Base parcial: ${money(grossProfit - data.expenses.variable)}`,
        financeAmount: grossProfit === null ? null : grossProfit - data.expenses.variable,
        financeUnit: 'currency',
        financeAmountLabel: 'Lucro bruto menos despesas variáveis cadastradas; cobertura parcial',
        chartValues: data.trend.map((entry) => entry.grossProfit),
        chartLabel: 'Lucro bruto registrado por período; não desconta todos os custos variáveis',
        status: 'partial',
      },
      {
        name: 'Ponto de equilíbrio',
        accounting: 'Cobertura contábil dos custos de estrutura.',
        accountingValue: 'Sem custos completos e escrituração',
        finance: `Despesas fixas cadastradas: ${money(data.expenses.fixed)}; o cadastro pode não representar todos os custos da operação.`,
        financeValue: 'Não calculado — custos fixos e variáveis não têm cobertura confirmada',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'EBITDA e margem EBITDA',
        accounting: 'Resultado antes de juros, impostos, depreciação e amortização.',
        accountingValue: 'Não escriturado',
        finance: `Despesas financeiras: ${money(data.expenses.financial)}; tributos cadastrados: ${money(data.expenses.tax)}. Depreciação e amortização não são registradas.`,
        financeValue: 'Não apurado — faltam despesas e depreciação/amortização completas',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Ciclo operacional e de caixa',
        accounting: 'Datas contábeis de recebimento de mercadorias e liquidação.',
        accountingValue: 'Sem trilha completa',
        finance: 'Há datas de NF-e, vencimentos e pedidos, mas os recebimentos de vendas e movimentos de estoque não estão conciliados.',
        financeValue: 'Não calculado — recebimentos e giro de estoque não conciliados',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'CMV e prazo médio de estocagem (PME)',
        accounting: 'CMV oficial por inventário e custo médio ponderado.',
        accountingValue: 'Não há inventário contábil fechado',
        finance: `CMV calculado em ${itemsWithCost} itens com custo histórico.`,
        financeValue: cmv === null ? 'CMV incompleto; PME sem histórico de giro valorizado' : `CMV registrado: ${money(cmv)}; PME ainda sem base de movimentação`,
        financeAmount: data.totals.knownCostOfGoodsSold,
        financeUnit: 'currency',
        financeAmountLabel: 'CMV conhecido; itens sem custo ficam de fora',
        chartValues: data.trend.map((entry) => entry.knownCostOfGoodsSold),
        chartLabel: 'Custo conhecido dos produtos vendidos por período',
        status: 'partial',
      },
      {
        name: 'Markup por setor e Curva ABC',
        accounting: 'Custo médio ponderado de aquisição por setor.',
        accountingValue: 'Custo oficial não consolidado',
        finance: `${productsEvaluated} produto(s) com venda no período estão disponíveis para análise por SKU.`,
        financeValue: 'Markup setorial e classificação ABC ainda não calculados',
        financeAmount: data.products.length ? data.products.reduce((sum, product) => sum + product.revenue, 0) : null,
        financeUnit: 'currency',
        financeAmountLabel: 'Faturamento dos produtos listados; markup/Curva ABC não calculados',
        chartValues: data.products.slice(0, 12).map((product) => product.revenue),
        chartLabel: 'Faturamento por produto nos itens mais vendidos',
        status: productsEvaluated ? 'partial' : 'unavailable',
      },
      {
        name: 'Quebras, perdas e desperdício',
        accounting: 'Baixas físicas rastreáveis para conformidade fiscal.',
        accountingValue: 'Sem lançamentos de perdas contábeis',
        finance: 'O módulo financeiro não recebe baixas de perdas com custo e motivo conciliados.',
        financeValue: 'Sem total financeiro de perdas confirmado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Provisão de férias, 13º e turnover',
        accounting: 'Provisões legais e custo de folha.',
        accountingValue: 'Sem módulo de folha/contabilidade',
        finance: 'O ERP não possui cadastro de folha nem custos de desligamento.',
        financeValue: 'Não calculado — dados de RH ausentes',
        financeAmount: null,
        status: 'unavailable',
      },
    ],
    liquidity: [
      {
        name: 'Fluxo de caixa (DFC vs. operacional)',
        accounting: 'DFC oficial pelas normas contábeis.',
        accountingValue: 'Não gerado neste ERP',
        finance: `Despesas da empresa pagas e registradas: ${paidCompanyExpenses}; fornecedores pagos neste mês: ${money(liquidity.paidThisMonth)}.`,
        financeValue: 'Parcial — vendas e extratos bancários não conciliados',
        financeAmount: liquidity.paidThisMonth,
        financeUnit: 'currency',
        financeAmountLabel: 'Pagamentos registrados a fornecedores neste mês',
        chartValues: liquidity.paidTrend.map((entry) => entry.paid),
        chartLabel: 'Pagamentos a fornecedores registrados por mês',
        status: 'partial',
      },
      {
        name: 'Capital de giro e NCG',
        accounting: 'Mutações do capital circulante líquido.',
        accountingValue: 'Ativos e passivos não fechados',
        finance: `Obrigações abertas registradas: fornecedores ${supplierOpen}; despesas manuais ${money(data.expenses.openAmount)}.`,
        financeValue: 'Parcial — faltam recebíveis e estoque valorizado',
        financeAmount: liquidity.outstanding + data.expenses.openAmount,
        financeUnit: 'currency',
        financeAmountLabel: 'Obrigações abertas registradas; não é NCG',
        status: 'partial',
      },
      {
        name: 'Índices de liquidez',
        accounting: 'Liquidez corrente, seca, imediata e geral no balanço.',
        accountingValue: 'Sem balanço patrimonial completo',
        finance: `${accountCount} conta(s) financeira(s) ativa(s) cadastrada(s); saldos informados têm datas de referência próprias.`,
        financeValue: 'Índices não calculados — ativos e passivos não conciliados',
        financeAmount: accountCount ? ledger.financialAccounts
          .filter((account) => account.active)
          .reduce((sum, account) => sum + Number(account.openingBalance), 0) : null,
        financeUnit: 'currency',
        financeAmountLabel: 'Soma de saldos informados nas contas ativas; não conciliada',
        status: accountCount ? 'partial' : 'unavailable',
      },
      {
        name: 'Conciliação de cartões e Pix',
        accounting: 'Escrituração das vendas por adquirente, taxas e extrato.',
        accountingValue: 'Sem conciliação contábil de recebíveis',
        finance: 'O ERP registra pedidos e estornos, mas não concilia liquidações da adquirente com extrato bancário.',
        financeValue: 'Não conciliado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Prazos médios de recebimento e pagamento (PMR/PMF)',
        accounting: 'Histórico de recebimento e pagamento por competência.',
        accountingValue: 'Datas de liquidação incompletas',
        finance: `${liquidity.openCount} parcela(s) de NF-e lançada(s) em aberto; recebimentos de clientes não conciliados.`,
        financeValue: 'PMR/PMF não calculados — faltam baixas conciliadas',
        financeAmount: null,
        status: 'partial',
      },
      {
        name: 'Orçamento vs. realizado',
        accounting: 'Consolidação e registro dos desvios orçamentários.',
        accountingValue: 'Orçamento contábil não cadastrado',
        finance: `${expenseCount} despesa(s) cadastrada(s), total de ${expenseAmount} por competência.`,
        financeValue: 'Realizado disponível; orçamento mensal ainda não cadastrado',
        financeAmount: data.expenses.total,
        financeUnit: 'currency',
        financeAmountLabel: 'Despesas cadastradas por competência; orçamento não informado',
        chartValues: data.trend.map((entry) => entry.operatingExpenses),
        chartLabel: 'Despesas lançadas por competência ao longo do período',
        status: expenseCount ? 'partial' : 'unavailable',
      },
      {
        name: 'Inadimplência e PDD',
        accounting: 'Provisão contábil de créditos duvidosos.',
        accountingValue: 'Sem carteira de recebíveis contabilizada',
        finance: `Parcelas de fornecedor vencidas: ${money(liquidity.overdue)}; não representa inadimplência de clientes.`,
        financeValue: 'PDD não calculada — recebíveis e chargebacks não conciliados',
        financeAmount: liquidity.overdue,
        financeUnit: 'currency',
        financeAmountLabel: 'Contas de fornecedores vencidas; não representa inadimplência de clientes',
        chartValues: [liquidity.openByDueDate.overdue, liquidity.openByDueDate.dueNext30Days, liquidity.openByDueDate.dueLaterOrUnscheduled],
        chartLabel: 'Contas a pagar por faixa de vencimento',
        status: 'partial',
      },
      {
        name: 'Runway e burn rate',
        accounting: 'Consumo de reservas patrimoniais acumuladas.',
        accountingValue: 'Sem saldos contábeis fechados',
        finance: 'Existem snapshots de saldo informados e despesas, mas sem histórico completo de entradas/saídas.',
        financeValue: 'Não calculado — fluxo de caixa incompleto',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Efeito tesoura (overtrading)',
        accounting: 'Sinalização de descasamento no ativo circulante.',
        accountingValue: 'Sem balanços comparáveis',
        finance: 'Não há série de capital de giro e crescimento conciliada com saldo de caixa.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Créditos tributários (ICMS/PIS/COFINS)',
        accounting: 'Escrituração e compensação fiscal de tributos.',
        accountingValue: 'Sem apuração fiscal no ERP',
        finance: 'NF-e de entrada estão registradas, mas créditos não foram validados por regime e escrituração.',
        financeValue: 'Não calculado — requer validação fiscal',
        financeAmount: null,
        status: 'unavailable',
      },
    ],
    value: [
      {
        name: 'Balanço patrimonial',
        accounting: 'Ativo, passivo e patrimônio líquido oficiais.',
        accountingValue: 'Não escriturado',
        finance: 'Há cadastros de contas e obrigações de NF-e, mas não um razão patrimonial completo.',
        financeValue: 'Não gerado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'ROI e ROIC',
        accounting: 'Retorno sobre ativos e capital investido.',
        accountingValue: 'Ativos/investimentos sem escrituração',
        finance: 'Não há imobilizado nem histórico de capital investido cadastrado.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'ROE',
        accounting: 'Retorno sobre patrimônio líquido integralizado.',
        accountingValue: 'Patrimônio líquido não apurado',
        finance: 'Não há saldo de capital dos sócios e lucro líquido fechado.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Valuation e EVA',
        accounting: 'DVA e valor adicionado escriturado.',
        accountingValue: 'Sem demonstrações contábeis fechadas',
        finance: 'Não há custo de capital, fluxo projetado ou avaliação de mercado cadastrados.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Endividamento geral',
        accounting: 'Passivo total em relação ao ativo.',
        accountingValue: 'Ativo/passivo total não apurados',
        finance: `Obrigações em aberto de NF-e: ${supplierOpen}; esse valor isolado não é índice de endividamento.`,
        financeValue: 'Parcial — demais dívidas e ativos não cadastrados',
        financeAmount: liquidity.outstanding,
        financeUnit: 'currency',
        financeAmountLabel: 'Obrigações abertas de fornecedores; não é índice de endividamento',
        chartValues: liquidity.paidTrend.map((entry) => entry.paid),
        chartLabel: 'Histórico de pagamentos a fornecedores; dívidas adicionais não conciliadas',
        status: 'partial',
      },
      {
        name: 'Custo de capital (WACC)',
        accounting: 'Custo ponderado de capital próprio e de terceiros.',
        accountingValue: 'Fontes de capital não escrituradas',
        finance: 'Faltam custo de dívida, capital próprio e estrutura de financiamento.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Grau de alavancagem financeira (GAF)',
        accounting: 'Impacto de despesas financeiras no lucro.',
        accountingValue: 'DRE contábil completa indisponível',
        finance: `Despesas financeiras cadastradas no período: ${money(data.expenses.financial)}; resultado e juros não estão completos.`,
        financeValue: 'Não calculado',
        financeAmount: data.expenses.financial,
        financeUnit: 'currency',
        financeAmountLabel: 'Despesas financeiras cadastradas; GAF não calculado',
        status: 'unavailable',
      },
      {
        name: 'Testes de impairment',
        accounting: 'Redução legal do valor recuperável dos ativos.',
        accountingValue: 'Imobilizado não escriturado',
        finance: 'Não há cadastro de ativos imobilizados e valor recuperável.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'DMPL / DLPA',
        accounting: 'Mutações do patrimônio líquido e destinação do lucro.',
        accountingValue: 'Sem saldos contábeis de patrimônio',
        finance: 'Distribuições e reinvestimentos não são registrados no ERP.',
        financeValue: 'Não gerado',
        financeAmount: null,
        status: 'unavailable',
      },
      {
        name: 'Provisões e contingências',
        accounting: 'Obrigações prováveis fiscais, trabalhistas e cíveis.',
        accountingValue: 'Sem cadastro contábil de contingências',
        finance: 'Não há registros de provisões e riscos jurídicos integrados.',
        financeValue: 'Não calculado',
        financeAmount: null,
        status: 'unavailable',
      },
    ],
  };
}

function PillarIndicatorGroup({ title, id, rows, perspective }) {
  const isFinancial = perspective === 'financial';
  return <details className="financial-pillar-disclosure" id={id}>
    <summary>
      <span>{title}</span>
      <small>{rows.length} mostradores</small>
    </summary>
    <section className="financial-pillar-dashboard" aria-label={`${title}: mostradores ${isFinancial ? 'financeiros' : 'contábeis'}`}>
      <div className="financial-pillar-dashboard-grid">
        {rows.map((row) => <article className="financial-pillar-indicator" key={row.name}>
          <div className="financial-pillar-indicator-heading">
            <h3>{row.name}</h3>
            <span className={`financial-indicator-state ${row.status}`}>{indicatorStatusLabels[row.status]}</span>
          </div>
          {isFinancial ? <>
            <strong className="financial-pillar-indicator-value">
              {row.financeAmount === undefined
                ? row.financeValue
                : row.financeAmount === null
                  ? '—'
                  : row.financeUnit === 'percent' ? percent(row.financeAmount) : row.financeUnit === 'days' ? `${Number(row.financeAmount).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias` : money(row.financeAmount)}
            </strong>
            <small className="financial-pillar-indicator-value-label">
              {row.financeAmount === null ? row.financeValue : row.financeAmountLabel || row.financeValue}
            </small>
            <p className="financial-pillar-indicator-description">{row.finance}</p>
          </> : <>
            <strong className="financial-pillar-indicator-value">{row.accountingValue}</strong>
            <p className="financial-pillar-indicator-description">{row.accounting}</p>
          </>}
          {isFinancial && row.chartValues && <figure className="financial-pillar-chart">
            <MetricChart values={row.chartValues} label={row.chartLabel} color="blue" />
            <figcaption>{row.chartLabel}</figcaption>
          </figure>}
        </article>)}
      </div>
    </section>
  </details>;
}

export default function FinancialPage() {
  const pathname = usePathname();
  const [data, setData] = useState(null);
  const [ledger, setLedger] = useState(null);
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
        const [response, ledgerResponse] = await Promise.all([
          fetch(`/api/erp/financeiro${query ? `?${query}` : ''}`, {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/erp/financeiro/records', { cache: 'no-store', signal: controller.signal }),
        ]);
        const [result, ledgerResult] = await Promise.all([response.json(), ledgerResponse.json()]);
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os indicadores financeiros.');
        if (!ledgerResponse.ok) throw new Error(ledgerResult.error || 'Não foi possível carregar os lançamentos financeiros.');
        if (!result.financial || !Array.isArray(result.financial.promotionTypes) || !result.liquidity) {
          throw new Error('A resposta do financeiro veio incompleta. Tente atualizar a página.');
        }
        if (!Array.isArray(ledgerResult.chartAccounts) || !Array.isArray(ledgerResult.financialAccounts) || !Array.isArray(ledgerResult.expenses) || !ledgerResult.dueSummary) {
          throw new Error('A resposta dos cadastros financeiros veio incompleta. Atualize a página.');
        }
        if (active) {
          setData(result.financial);
          setLiquidity(result.liquidity);
          setLedger(ledgerResult);
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
    ? `Todo o histórico desde ${formatDate(data.period.firstFinancialOrderDate || data.period.firstOrderDate)}`
    : `${formatPeriodDate(data?.period.startDate) || 'Início do histórico'} a ${formatPeriodDate(data?.period.endDate) || formatDate(new Date())}`;
  const hasFinancialOrders = Boolean(data?.period.orders);
  const hasPromotionCoverageGap = Boolean(data?.totals.items)
    && data.coverage.promotionCoveragePercent !== 100;
  const trendRows = data?.trend || [];
  const trendLabel = data?.trendGranularity === 'day' ? 'diário' : 'mensal';
  const chartValues = (key) => trendRows.map((entry) => entry[key]);
  const chartDescription = (label) => `${label} ${trendLabel} no período selecionado`;
  const knownLiquidity = Boolean(liquidity);
  const pillarIndicators = data && liquidity && ledger ? buildPillarIndicators(data, liquidity, ledger) : null;
  const financialScreen = pathname === '/erp/financeiro' ? 'home' : pathname.split('/').filter(Boolean).at(-1);

  return <div className="erp-page financial-page">
    <header className="financial-header">
      <div>
        <span className="eyebrow">Gestão financeira</span>
        <h1>{financialScreenLabels[financialScreen] || 'Financeiro'}</h1>
        <p>{financialScreen === 'home' ? 'Visão geral dos resultados e acesso às áreas financeiras.' : financialScreen === 'mostradores-contador' ? 'Origem e compliance contábil nos três pilares de decisão.' : financialScreen === 'mostradores-financeiro' ? 'Aplicação e rotina financeira nos três pilares de decisão.' : 'Dados financeiros do período selecionado.'}</p>
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
    {data && ledger && <>
    <nav className="financial-section-nav" aria-label="Navegação do Financeiro">
      <Link href="/erp/financeiro" aria-current={financialScreen === 'home' ? 'page' : undefined}>Início</Link>
      <Link href="/erp/financeiro/dre" aria-current={financialScreen === 'dre' ? 'page' : undefined}>DRE</Link>
      <Link href="/erp/financeiro/fluxo-de-caixa" aria-current={financialScreen === 'fluxo-de-caixa' ? 'page' : undefined}>Fluxo de Caixa</Link>
      <Link href="/erp/financeiro/despesas" aria-current={financialScreen === 'despesas' ? 'page' : undefined}>Despesas, contas e vencimentos</Link>
      <Link href="/erp/financeiro/mostradores-financeiro" aria-current={financialScreen === 'mostradores-financeiro' ? 'page' : undefined}>Mostradores Financeiro</Link>
      <Link href="/erp/financeiro/mostradores-contador" aria-current={financialScreen === 'mostradores-contador' ? 'page' : undefined}>Mostradores Contador</Link>
    </nav>
    <div className="financial-period-summary" id="financial-home">
      <CalendarDays size={15} aria-hidden="true" />
        <span>{periodLabel}</span>
        <strong>{data.dre.orders.toLocaleString('pt-BR')} pedido(s) financeiros · {data.period.orders.toLocaleString('pt-BR')} operacionais</strong>
      </div>

      {((hasFinancialOrders && !data.totals.marginAvailable) || hasPromotionCoverageGap || data.coverage.unreconciledOrders > 0 || data.dre.cancelledOrders > 0) && <div className="financial-data-notice" role="status">
        {hasFinancialOrders && !data.totals.marginAvailable && <p>
          Margem bruta completa indisponível: {data.coverage.missingCostItems} item(ns) sem custo, {data.coverage.ordersWithoutItems} pedido(s) sem itens, {data.coverage.invalidOrders} pedido(s) com valor inválido, {data.coverage.invalidItems} item(ns) inválido(s) e {data.coverage.unreconciledOrders} pedido(s) sem conciliação. Custos parciais não são tratados como zero.
        </p>}
        {hasPromotionCoverageGap && <p>
          Tipo promocional registrado em {percent(data.coverage.promotionCoveragePercent)} dos itens; pedidos antigos sem marcador ficam como “Não rastreado”, não como venda sem promoção.
        </p>}
        {data.coverage.unreconciledOrders > 0 && <p>Há pedidos cujos itens e total não conciliam; eles permanecem no faturamento, mas não na margem completa.</p>}
        {data.dre.cancelledOrders > 0 && <p>{data.dre.cancelledOrders} pedido(s) cancelado(s) com atividade financeira entram no DRE e nos estornos, mas não nas análises operacionais de vendas. Quando houver saldo após estorno, o CMV fica sem apuração até confirmar o destino do estoque.</p>}
      </div>}

      {financialScreen === 'home' && <section className="financial-metrics" aria-label="Indicadores principais; gráficos mostram a evolução no período selecionado">
        <MetricCard icon={Banknote} label="Faturamento líquido" value={money(data.dre.netRevenue)} detail="Vendas registradas menos estornos confirmados" chartValues={chartValues('revenue')} chartLabel={chartDescription('Faturamento líquido')} emphasis />
        <MetricCard icon={CircleDollarSign} label="Lucro bruto" value={money(data.totals.grossProfit)} detail="Receita líquida menos CMV; antes das despesas" chartValues={chartValues('grossProfit')} chartLabel={chartDescription('Lucro bruto')} />
        <MetricCard icon={TrendingUp} label="Margem bruta real" value={percent(data.totals.grossMargin)} detail="Após descontos, estornos e custo por item vendido" chartValues={chartValues('grossMargin')} chartLabel={chartDescription('Margem bruta')} />
        <MetricCard icon={PackageSearch} label={data.totals.costOfGoodsSold === null ? 'CMV conhecido' : 'CMV'} value={money(data.totals.costOfGoodsSold ?? data.totals.knownCostOfGoodsSold)} detail={data.totals.costOfGoodsSold === null ? `${data.coverage.knownCostItems} de ${data.totals.items} itens com custo` : 'Custo dos produtos vendidos'} chartValues={chartValues('knownCostOfGoodsSold')} chartLabel={chartDescription('CMV conhecido')} />
        <MetricCard icon={Tag} label="Descontos registrados" value={money(data.totals.discounts)} detail="Descontos em itens e no pedido" chartValues={chartValues('discounts')} chartLabel={chartDescription('Descontos registrados')} />
        <MetricCard icon={ShoppingBag} label="Ticket médio" value={money(data.dre.orders ? data.dre.netRevenue / data.dre.orders : 0)} detail={`${data.dre.orders.toLocaleString('pt-BR')} pedido(s) financeiros no período`} chartValues={chartValues('averageTicket')} chartLabel={chartDescription('Ticket médio')} />
        <MetricCard icon={TrendingDown} label="Despesas cadastradas" value={money(data.expenses.total)} detail={`${data.expenses.count} lançamento(s) por competência; pagamentos em aberto: ${money(data.expenses.openAmount)}`} chartValues={chartValues('operatingExpenses')} chartLabel={chartDescription('Despesas cadastradas')} />
      </section>}

      {financialScreen === 'dre' && <section className="financial-panel" id="financial-dre" aria-labelledby="financial-dre-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Pilar 1 · Eficiência, giro e margem</span><h2 id="financial-dre-title">Demonstração do Resultado (DRE)</h2></div>
          <div className="financial-mode-switch" role="group" aria-label="Modelo da demonstração de resultado">
            <button type="button" aria-pressed={dreMode === 'managerial'} onClick={() => setDreMode('managerial')}>Gerencial</button>
            <button type="button" aria-pressed={dreMode === 'official'} onClick={() => setDreMode('official')}>Oficial</button>
          </div>
        </div>
        {dreMode === 'managerial' ? <>
          <p className="financial-explainer">DRE gerencial preliminar baseada nos pedidos, no custo histórico dos itens e nas despesas manuais lançadas por competência. O total de despesas cadastradas não significa que toda a operação foi lançada.</p>
          <div className="financial-dre-layout">
            <div className="financial-table-scroll" role="region" aria-label="DRE gerencial preliminar" tabIndex={0}>
              <table>
                <caption>Apuração operacional; esta demonstração não substitui a escrituração contábil oficial</caption>
                <thead><tr><th scope="col">Linha do resultado</th><th scope="col">Valor</th><th scope="col">Base</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Vendas após descontos, antes de estornos</th><td>{money(data.dre.salesBeforeRefunds)}</td><td>{data.dre.orders} pedido(s) financeiro(s), incluindo pedidos cancelados com pagamento/estorno reconhecido</td></tr>
                  <tr><th scope="row">(-) Estornos confirmados</th><td className="financial-negative">{money(-data.dre.refunds)}</td><td>Valores confirmados registrados no ERP/Pagar.me</td></tr>
                  <tr className="financial-dre-total"><th scope="row">(=) Receita líquida após estornos</th><td>{money(data.dre.netRevenue)}</td><td>Vendas menos estornos confirmados</td></tr>
                  <tr><th scope="row">(-) CMV</th><td>{data.dre.costOfGoodsSold === null ? 'Não apurado integralmente' : money(-data.dre.costOfGoodsSold)}</td><td>{data.dre.costOfGoodsSold === null ? `${data.coverage.knownCostItems} de ${data.totals.items} itens com custo` : 'Custo registrado nos itens vendidos'}</td></tr>
                  <tr className="financial-dre-total"><th scope="row">(=) Lucro bruto</th><td>{money(data.dre.grossProfit)}</td><td>Receita líquida menos CMV completo</td></tr>
                  <tr><th scope="row">(-) Despesas cadastradas no período</th><td>{money(-data.dre.operatingExpenses)}</td><td>{data.expenses.count} lançamento(s) por competência; pagas {money(data.expenses.paidAmount)} · em aberto {money(data.expenses.openAmount)}</td></tr>
                  <tr className="financial-dre-total"><th scope="row">(=) Resultado após despesas registradas</th><td>{money(data.dre.operatingResult)}</td><td>Gerencial e parcial; despesas não lançadas não são presumidas como zero</td></tr>
                  <tr><th scope="row">EBITDA / resultado líquido oficial</th><td>Não apurado</td><td>Faltam escrituração completa, tributos, juros, depreciação e amortização</td></tr>
                </tbody>
              </table>
            </div>
            <div className="financial-dre-chart" role="img" aria-label={`Composição do resultado: receita líquida ${money(data.dre.netRevenue)}, CMV ${money(data.dre.costOfGoodsSold)}, despesas registradas ${money(data.dre.operatingExpenses)}, lucro bruto ${money(data.dre.grossProfit)}`}>
              <span>Composição da receita</span>
              <div><i style={{ width: `${data.dre.netRevenue > 0 ? 100 : 0}%` }} /><label>Receita líquida <strong>{money(data.dre.netRevenue)}</strong></label></div>
              <div><i className="cost" style={{ width: `${data.dre.costOfGoodsSold !== null && data.dre.netRevenue > 0 ? Math.min(100, Math.max(0, data.dre.costOfGoodsSold / data.dre.netRevenue * 100)) : 0}%` }} /><label>CMV completo <strong>{money(data.dre.costOfGoodsSold)}</strong></label></div>
              <div><i className="expenses" style={{ width: `${data.dre.netRevenue > 0 ? Math.min(100, Math.max(0, data.dre.operatingExpenses / data.dre.netRevenue * 100)) : 0}%` }} /><label>Despesas cadastradas <strong>{money(data.dre.operatingExpenses)}</strong></label></div>
              <div><i className="profit" style={{ width: `${data.dre.grossProfit !== null && data.dre.netRevenue > 0 ? Math.min(100, Math.max(0, data.dre.grossProfit / data.dre.netRevenue * 100)) : 0}%` }} /><label>Lucro bruto <strong>{money(data.dre.grossProfit)}</strong></label></div>
              <small>Escala relativa à receita líquida. Quando o CMV está incompleto, a composição não estima o lucro.</small>
            </div>
          </div>
          <p className="financial-source-note">Ponto de equilíbrio, EBITDA completo, margem de contribuição após custos variáveis, ciclo operacional e PME não são calculados sem despesas, folha, taxas, saldos de caixa e datas completas de recebimento/baixa de estoque.</p>
        </> : <div className="financial-official-notice" role="status">
          <strong>DRE oficial indisponível — não é um relatório fiscal/contábil.</strong>
          <p>O plano de contas e os lançamentos gerenciais podem ser cadastrados no ERP, mas ainda não há escrituração em partidas dobradas, regime fiscal/contábil completo, tributos apurados, folha, depreciação, juros ou encerramento contábil. O painel não produz nem substitui uma demonstração oficial assinada por profissional habilitado.</p>
          <Link href="/erp/suppliers/invoices">Consultar notas fiscais e contas a pagar registradas</Link>
        </div>}
      </section>}

      {financialScreen === 'fluxo-de-caixa' && <>
      <section className="financial-panel" id="financial-liquidity" aria-labelledby="financial-liquidity-title">
        <div className="financial-section-heading">
          <div><span className="eyebrow">Pilar 2 · Fôlego, caixa e tesouraria</span><h2 id="financial-liquidity-title">Obrigações e liquidez registradas</h2></div>
          <Link href="/erp/suppliers/invoices">Notas fiscais e parcelas a pagar</Link>
        </div>
        <p className="financial-explainer">Visão das parcelas de NF-e já lançadas e do faturamento registrado. Vendas não equivalem a entradas de caixa; recebimentos de adquirentes, despesas pagas e extratos ainda não estão conciliados para gerar um fluxo de caixa completo.</p>
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
          <div><span className="eyebrow">Vendas registradas · não é entrada de caixa conciliada</span><h2 id="financial-trend-title">Evolução do faturamento</h2></div>
          <span>{data.trendGranularity === 'day' ? 'Por dia' : 'Por mês'}</span>
        </div>
        <FinancialTrend trend={data.trend} granularity={data.trendGranularity} />
      </section>
      </>}
      {financialScreen === 'despesas' && <FinancialRecords ledger={ledger} onSaved={() => setRefreshToken((token) => token + 1)} />}

      {pillarIndicators && financialScreen === 'mostradores-financeiro' && <section className="financial-indicators-screen" aria-labelledby="financial-indicators-financial-title">
        <h2 id="financial-indicators-financial-title">Mostradores Financeiro</h2>
        <p>Aplicação e rotina financeira, distribuídas pelos três pilares de decisão.</p>
        <div className="financial-indicator-groups">
          <PillarIndicatorGroup id="financial-finance-operational" title="1 · Eficiência, giro e margem" rows={pillarIndicators.operational} perspective="financial" />
          <PillarIndicatorGroup id="financial-finance-liquidity" title="2 · Liquidez, fôlego e tesouraria" rows={pillarIndicators.liquidity} perspective="financial" />
          <PillarIndicatorGroup id="financial-finance-value" title="3 · Patrimônio, retorno e estratégia" rows={pillarIndicators.value} perspective="financial" />
        </div>
      </section>}
      {pillarIndicators && financialScreen === 'mostradores-contador' && <section className="financial-indicators-screen" aria-labelledby="financial-indicators-accounting-title">
        <h2 id="financial-indicators-accounting-title">Mostradores Contador</h2>
        <p>Origem e compliance contábil, distribuídos pelos três pilares de decisão.</p>
        <div className="financial-indicator-groups">
          <PillarIndicatorGroup id="financial-accounting-operational" title="1 · Eficiência, giro e margem" rows={pillarIndicators.operational} perspective="accounting" />
          <PillarIndicatorGroup id="financial-accounting-liquidity" title="2 · Liquidez, fôlego e tesouraria" rows={pillarIndicators.liquidity} perspective="accounting" />
          <PillarIndicatorGroup id="financial-accounting-value" title="3 · Patrimônio, retorno e estratégia" rows={pillarIndicators.value} perspective="accounting" />
        </div>
      </section>}

      {financialScreen === 'home' && <details className="financial-analysis-disclosure">
        <summary>Análises detalhadas de vendas e promoções <small>Evolução, descontos, produtos e cupons</small></summary>
        <div className="financial-analysis-content">
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
        </div>
      </details>}

      <footer className="financial-disclaimer">
        <TrendingDown size={16} aria-hidden="true" />
        <p>Este painel calcula uma visão gerencial com pedidos, custos históricos e despesas cadastradas. Não representa contabilidade oficial: despesas fixas, taxas, impostos, folha, ativos e recebíveis podem estar incompletos e não são presumidos como zero.</p>
      </footer>
    </>}
  </div>;
}
