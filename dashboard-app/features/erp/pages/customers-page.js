'use client';

import { CalendarDays, ChevronRight, Mail, MapPin, Phone, PiggyBank, Search, ShoppingBag, Star, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const initialCustomers = [];

function normalizeSearch(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function ERPCustomersPage() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selected, setSelected] = useState(null);
  const [budgetDataAvailable, setBudgetDataAvailable] = useState(true);

  useEffect(() => {
    fetch('/api/erp/customers')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os clientes.');
        return data;
      })
      .then(({ customers: savedCustomers = [], budgetDataAvailable: hasBudgetData = true }) => {
        setCustomers(savedCustomers);
        setBudgetDataAvailable(hasBudgetData);
      })
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const searchText = normalizeSearch([
      customer.name,
      customer.email,
      customer.id,
      customer.phone,
      customer.city,
      customer.status,
      ...(customer.tags || []),
    ].join(' '));
    return searchText.includes(normalizeSearch(query)) && (statusFilter === 'Todos' || customer.status === statusFilter);
  }), [customers, query, statusFilter]);

  const metrics = [
    ['Clientes cadastrados', customers.length, UserRound],
    ['Clientes ativos', customers.filter((customer) => customer.status === 'Ativo').length, ShoppingBag],
    ['Sem comprar há 30+ dias', customers.filter((customer) => customer.daysWithoutPurchase >= 30).length, CalendarDays],
    ['LTV médio', 'Sem dados', Star],
  ];

  const toggleStatus = (customer) => {
    setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, status: item.status === 'Ativo' ? 'Inativo' : 'Ativo' } : item));
    setSelected((current) => current ? { ...current, status: current.status === 'Ativo' ? 'Inativo' : 'Ativo' } : current);
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const selectedBudgetProgress = selected?.monthlyBudget > 0
    ? Math.min(100, (selected.currentMonthSpent / selected.monthlyBudget) * 100)
    : 0;

  return (
    <div className="erp-customers-page">
      <div className="erp-customer-header"><div><span className="eyebrow">Relacionamento e dados</span><h1>Clientes</h1><p>Visao completa de cadastro, comportamento, compras e preferencias.</p></div><button type="button" className="primary-cta">+ Novo cliente</button></div>
      <div className="erp-customer-metrics">{metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}</div>
      <div className="erp-customer-toolbar"><div className="erp-customer-search"><Search size={16} /><input placeholder="Buscar cliente por nome, e-mail, telefone, cidade ou ID" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={15} /></button>}</div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Inativo</option></select></div>
      <div className="erp-customer-layout"><section className="erp-customer-table-card"><div className="erp-table-heading"><div><h3>Base de clientes</h3><p>{loading ? 'Carregando dados reais...' : `${filteredCustomers.length} registros encontrados`}</p></div></div>{!budgetDataAvailable && <p className="erp-budget-warning" role="status">Os planos orçamentários estão indisponíveis porque não foi possível conectar ao banco de dados.</p>}{filteredCustomers.length ? <div className="erp-table-scroll"><table className="erp-table erp-customers-table"><thead><tr><th>Cliente</th><th>Status</th><th>Última compra</th><th>Dias sem comprar</th><th>Pedidos</th><th>Total gasto</th><th>Plano orçamentário</th><th></th></tr></thead><tbody>{filteredCustomers.map((customer) => <tr key={customer.id} className={selected?.id === customer.id ? 'selected-row' : ''} onClick={() => setSelected(customer)}><td><strong>{customer.name}</strong><small>{customer.id} · {customer.email}</small></td><td><span className={`erp-status ${customer.status.toLowerCase()}`}>{customer.status}</span></td><td>{customer.lastPurchase}</td><td><span className={customer.daysWithoutPurchase >= 30 ? 'customer-risk' : ''}>{customer.daysWithoutPurchase === null ? 'Sem dados' : `${customer.daysWithoutPurchase} dias`}</span></td><td>{customer.orders}</td><td>{formatCurrency(customer.spent)}</td><td>{!customer.budgetDataAvailable ? 'Indisponível' : customer.monthlyBudget ? formatCurrency(customer.monthlyBudget) : 'Não definido'}</td><td><ChevronRight size={15} /></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">{loading ? 'Carregando dados reais...' : 'Nenhum cliente com atividade registrada.'}</div>}</section>
      {selected && <aside className="erp-customer-detail"><button type="button" className="detail-close" onClick={() => setSelected(null)}><X size={16} /></button><div className="customer-profile-heading"><div className="customer-avatar"><UserRound size={22} /></div><div><h2>{selected.name}</h2><span>{selected.id}</span></div></div><div className="customer-detail-actions"><button type="button" className="editor-ghost" onClick={() => toggleStatus(selected)}>{selected.status === 'Ativo' ? 'Desativar cliente' : 'Ativar cliente'}</button></div><div className="customer-contact-list"><span><Mail size={14} /> {selected.email}</span>{selected.phone && <span><Phone size={14} /> {selected.phone}</span>}{selected.city && <span><MapPin size={14} /> {selected.city}</span>}</div><div className="customer-detail-stats"><div><strong>{selected.orders}</strong><small>Pedidos</small></div><div><strong>{formatCurrency(selected.spent)}</strong><small>Total gasto</small></div><div><strong>{selected.favorites}</strong><small>Favoritos</small></div><div><strong>{selected.cartItems}</strong><small>No carrinho</small></div></div><section className="customer-detail-section customer-budget-section"><h3><PiggyBank size={16} /> Plano orçamentário</h3>{!selected.budgetDataAvailable ? <p>Dados do orçamento indisponíveis no momento.</p> : selected.monthlyBudget > 0 ? <><div className="customer-budget-values"><span>Limite mensal</span><strong>{formatCurrency(selected.monthlyBudget)}</strong></div><div className="customer-budget-values"><span>Gasto neste mês</span><strong>{formatCurrency(selected.currentMonthSpent)}</strong></div><div className="customer-budget-progress" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(selectedBudgetProgress)}><span className={selectedBudgetProgress >= 80 ? 'near-limit' : ''} style={{ width: `${selectedBudgetProgress}%` }} /></div><small>{selectedBudgetProgress >= 100 ? `Orçamento excedido em ${formatCurrency(selected.currentMonthSpent - selected.monthlyBudget)}` : `${Math.round(selectedBudgetProgress)}% do orçamento mensal utilizado`}</small></> : <p>Este cliente ainda não definiu um orçamento mensal.</p>}</section><section className="customer-detail-section"><h3>Produtos favoritos ({selected.favoriteItems?.length || 0})</h3>{selected.favoriteItems?.length ? selected.favoriteItems.map((item) => <p key={item.name}><strong>{item.name}</strong> · {item.category || 'Sem categoria'}</p>) : <p>Nenhum favorito registrado.</p>}</section><section className="customer-detail-section"><h3>Itens no carrinho ({selected.cartItems})</h3>{selected.cartProducts?.length ? selected.cartProducts.map((item) => <p key={item.name}><strong>{item.name}</strong> · quantidade: {item.quantity || 1}</p>) : <p>Nenhum item no carrinho.</p>}</section><section className="customer-detail-section"><h3>Preferencias</h3>{selected.preferences?.length ? <div className="customer-tags">{selected.preferences.map((preference) => <span key={preference}>{preference}</span>)}</div> : <p>Nenhuma preferencia registrada.</p>}</section><section className="customer-detail-section"><h3>Comportamento</h3><p>Ultima compra: <strong>{selected.lastPurchase}</strong></p><p>Ticket medio: <strong>{selected.orders ? formatCurrency(selected.spent / selected.orders) : 'Sem dados'}</strong></p></section></aside>}
      </div>
    </div>
  );
}
