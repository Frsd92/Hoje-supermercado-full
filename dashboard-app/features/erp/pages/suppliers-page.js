'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Check, Download, Pencil, Plus, Search, X } from 'lucide-react';
import Link from 'next/link';

const statusOptions = ['Em Análise', 'Ativo', 'Inativo'];
const statusTabs = ['Todos', ...statusOptions];
const emptySupplier = {
  name: '',
  legalName: '',
  taxId: '',
  email: '',
  phone: '',
  whatsapp: '',
  categories: [],
  status: 'Em Análise',
  statusReason: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  contactPhone: '',
  financeContact: '',
  financeEmail: '',
  financePhone: '',
  address: '',
  city: '',
  state: '',
  postalCode: '',
  paymentTerms: '',
  minimumOrderValue: '',
  deliveryTerms: '',
};

const supplierFieldLabels = {
  name: 'Nome fantasia',
  legalName: 'Razão social',
  taxId: 'CPF/CNPJ',
  email: 'E-mail geral',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  categories: 'Categorias',
  status: 'Status',
  statusReason: 'Motivo da análise/inativação',
  contactName: 'Representante comercial',
  contactRole: 'Função do contato',
  contactEmail: 'E-mail comercial',
  contactPhone: 'Telefone comercial',
  financeContact: 'Contato financeiro',
  financeEmail: 'E-mail financeiro',
  financePhone: 'Telefone financeiro',
  address: 'Endereço',
  city: 'Cidade',
  state: 'UF',
  postalCode: 'CEP',
  paymentTerms: 'Condições de pagamento',
  minimumOrderValue: 'Pedido mínimo',
  deliveryTerms: 'Condições de entrega',
};

const formatCurrency = (value) => value === null || value === undefined
  ? '—'
  : `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
const formatDate = (value) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
}).format(new Date(value));
const escapeCsv = (value) => {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
};

function formatAuditValue(value) {
  if (value && typeof value === 'object' && value.__auditAbsent === true) return 'Não informado';
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(supplier || emptySupplier);
  const [categoryInput, setCategoryInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState([]);
  const [auditError, setAuditError] = useState('');
  const isEditing = Boolean(supplier?.id);

  useEffect(() => {
    if (!supplier?.id) return;
    let active = true;
    fetch(`/api/erp/suppliers/audit?supplierId=${encodeURIComponent(supplier.id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a auditoria.');
        if (active) setAudit(data.entries || []);
      })
      .catch((loadError) => {
        if (active) setAuditError(loadError.message || 'Não foi possível carregar a auditoria.');
      });
    return () => { active = false; };
  }, [supplier?.id]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const addCategories = () => {
    const added = categoryInput.split(',').map((item) => item.trim()).filter(Boolean);
    if (!added.length) return;
    updateField('categories', [...new Set([...(form.categories || []), ...added])]);
    setCategoryInput('');
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/erp/suppliers', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          id: supplier?.id,
          minimumOrderValue: form.minimumOrderValue === '' ? '' : String(form.minimumOrderValue).replace(',', '.'),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o fornecedor.');
      onSaved(data.supplier);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar o fornecedor.');
    } finally {
      setSaving(false);
    }
  };

  const auditFieldRows = (entry) => {
    if (entry.changes && typeof entry.changes === 'object') {
      return Object.entries(entry.changes).map(([field, values]) => (
        <div key={field}><dt>{supplierFieldLabels[field] || field}</dt><dd>Antes: {formatAuditValue(values.before)}<br />Depois: {formatAuditValue(values.after)}</dd></div>
      ));
    }
    if (entry.snapshot && typeof entry.snapshot === 'object') {
      return Object.entries(entry.snapshot)
        .filter(([field]) => supplierFieldLabels[field])
        .map(([field, value]) => <div key={field}><dt>{supplierFieldLabels[field]}</dt><dd>{Array.isArray(value) ? value.join(', ') : formatAuditValue(value)}</dd></div>);
    }
    return [];
  };

  const field = (label, key, type = 'text', props = {}) => <label key={key} className={props.className || ''}>{label}<input
    type={type}
    value={form[key] ?? ''}
    onChange={(event) => updateField(key, event.target.value)}
    required={props.required}
    maxLength={props.maxLength}
    inputMode={props.inputMode}
    placeholder={props.placeholder}
  /></label>;

  return <div className="supplier-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="supplier-drawer" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title">
      <header className="supplier-drawer-header"><div><span className="eyebrow">Cadastro de fornecedores</span><h2 id="supplier-form-title">{isEditing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2><p>Use os dados confirmados do fornecedor. O novo cadastro entra em análise.</p></div><button type="button" className="supplier-close-button" aria-label="Fechar formulário" onClick={onClose}><X size={20} /></button></header>
      <form className="supplier-form" onSubmit={save}>
        <section className="supplier-form-section"><h3>Identificação e contato</h3><div className="supplier-form-grid">
          {field('Nome fantasia', 'name', 'text', { required: true })}
          {field('Razão social', 'legalName')}
          {field('CPF/CNPJ', 'taxId', 'text', { inputMode: 'numeric', placeholder: 'Somente números ou documento formatado' })}
          {field('E-mail geral', 'email', 'email')}
          {field('Telefone', 'phone', 'tel')}
          {field('WhatsApp', 'whatsapp', 'tel')}
        </div></section>

        <section className="supplier-form-section"><h3>Categorias atendidas</h3><div className="supplier-category-entry"><input value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCategories(); } }} placeholder="Digite uma categoria e pressione Enter" /><button type="button" onClick={addCategories}>Adicionar</button></div><div className="supplier-category-tags">{(form.categories || []).map((category) => <span key={category}>{category}<button type="button" aria-label={`Remover categoria ${category}`} onClick={() => updateField('categories', form.categories.filter((item) => item !== category))}>×</button></span>)}</div></section>

        <section className="supplier-form-section"><h3>Homologação</h3><div className="supplier-form-grid">
          <label>Status<select value={form.status} onChange={(event) => updateField('status', event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="supplier-form-wide">Motivo / observações da análise<textarea rows="2" value={form.statusReason || ''} onChange={(event) => updateField('statusReason', event.target.value)} placeholder="Registre pendências ou o motivo da mudança de status." /></label>
        </div></section>

        <section className="supplier-form-section"><h3>Contatos comerciais e financeiros</h3><div className="supplier-form-grid">
          {field('Representante comercial', 'contactName')}
          {field('Função', 'contactRole')}
          {field('E-mail comercial', 'contactEmail', 'email')}
          {field('Telefone comercial', 'contactPhone', 'tel')}
          {field('Contato financeiro', 'financeContact')}
          {field('E-mail financeiro', 'financeEmail', 'email')}
          {field('Telefone financeiro', 'financePhone', 'tel')}
        </div></section>

        <section className="supplier-form-section"><h3>Endereço e condições comerciais</h3><div className="supplier-form-grid">
          {field('Endereço', 'address')}
          {field('Cidade', 'city')}
          {field('UF', 'state', 'text', { maxLength: 2 })}
          {field('CEP', 'postalCode', 'text', { inputMode: 'numeric' })}
          {field('Condições de pagamento', 'paymentTerms', 'text', { placeholder: 'Ex.: 28 dias, boleto' })}
          {field('Pedido mínimo (R$)', 'minimumOrderValue', 'number', { inputMode: 'decimal' })}
          {field('Condições de entrega', 'deliveryTerms', 'text', { placeholder: 'Ex.: CIF ou FOB, conforme negociado' })}
        </div></section>

        {error && <div className="supplier-form-error" role="alert">{error}</div>}
        <footer className="supplier-form-actions"><button type="button" className="supplier-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-cta" disabled={saving}>{saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar em análise'}</button></footer>
      </form>

      {isEditing && <section className="supplier-history"><h3>Histórico de auditoria</h3>{auditError && <p role="alert">{auditError}</p>}{!auditError && !audit.length && <p>Nenhuma alteração registrada ainda.</p>}{audit.map((entry) => <details key={entry.id}><summary><strong>{entry.action === 'CREATE' ? 'Cadastro inicial' : 'Alteração'}</strong><span>{formatDate(entry.occurredAt)} · {entry.actor}</span></summary><dl>{auditFieldRows(entry)}</dl></details>)}</section>}
    </section>
  </div>;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/erp/suppliers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar fornecedores.');
      setSuppliers(data.suppliers || []);
      setMetrics(data.metrics || null);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar fornecedores.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const categories = useMemo(
    () => [...new Set(suppliers.flatMap((supplier) => supplier.categories || []))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [suppliers],
  );
  const statusCounts = useMemo(() => ({
    Todos: suppliers.length,
    'Em Análise': suppliers.filter((supplier) => supplier.status === 'Em Análise').length,
    Ativo: suppliers.filter((supplier) => supplier.status === 'Ativo').length,
    Inativo: suppliers.filter((supplier) => supplier.status === 'Inativo').length,
  }), [suppliers]);
  const filteredSuppliers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return suppliers.filter((supplier) => {
      const matchesQuery = !normalizedQuery || [
        supplier.name, supplier.legalName, supplier.taxId, supplier.email, supplier.phone,
        supplier.contactName, supplier.id, ...(supplier.categories || []),
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));
      return matchesQuery
        && (statusFilter === 'Todos' || supplier.status === statusFilter)
        && (categoryFilter === 'Todas' || supplier.categories.includes(categoryFilter));
    });
  }, [suppliers, query, statusFilter, categoryFilter]);

  const saveCsv = () => {
    const columns = ['Nome fantasia', 'Razão social', 'CPF/CNPJ', 'E-mail', 'Telefone', 'WhatsApp', 'Categorias', 'Status', 'Motivo', 'Cidade', 'UF', 'Condições de pagamento', 'Pedido mínimo', 'Condições de entrega'];
    const rows = filteredSuppliers.map((supplier) => [
      supplier.name, supplier.legalName, supplier.taxId, supplier.email, supplier.phone, supplier.whatsapp,
      supplier.categories.join('; '), supplier.status, supplier.statusReason, supplier.city, supplier.state,
      supplier.paymentTerms, supplier.minimumOrderValue, supplier.deliveryTerms,
    ]);
    const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fornecedores-reais.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openCreate = () => {
    setSelectedSupplier(null);
    setFormOpen(true);
  };
  const openEdit = (supplier) => {
    setSelectedSupplier({
      ...supplier,
      minimumOrderValue: supplier.minimumOrderValue === null ? '' : String(supplier.minimumOrderValue),
    });
    setFormOpen(true);
  };
  const onSaved = async (supplier) => {
    setFormOpen(false);
    setSelectedSupplier(null);
    setNotice(`Fornecedor ${supplier.name} salvo com sucesso. A alteração foi registrada na auditoria.`);
    await loadSuppliers();
  };

  return <div className="erp-module-page supplier-page">
    <header className="erp-customer-header supplier-page-header"><div><span className="eyebrow">Compras e abastecimento</span><h1>Fornecedores</h1><p>Cadastros persistidos, homologação e condições comerciais confirmadas.</p></div><div className="supplier-header-actions"><button type="button" className="supplier-secondary-button" onClick={saveCsv} disabled={!filteredSuppliers.length}><Download size={15} /> Exportar CSV</button><button type="button" className="primary-cta" onClick={openCreate}><Plus size={15} /> Novo fornecedor</button></div></header>

    <nav className="supplier-subnav" aria-label="Módulos de abastecimento"><span className="active">Fornecedores</span><Link href="/erp/suppliers/orders">Ordens de compra</Link></nav>
    <section className="supplier-metrics" aria-label="Indicadores calculados com fornecedores cadastrados e ordens persistidas">
      <article><span>Total cadastrados</span><strong>{loading ? '—' : metrics?.total ?? 0}</strong><small>Registros salvos no ERP</small></article>
      <article className="active"><span>Ativos</span><strong>{loading ? '—' : metrics?.active ?? 0}</strong><small>Homologados para operação</small></article>
      <article className="review"><span>Em análise</span><strong>{loading ? '—' : metrics?.inReview ?? 0}</strong><small>Aguardando validação manual</small></article>
      <article><span>Categorias ativas</span><strong>{loading ? '—' : metrics?.activeCategories ?? 0}</strong><small>Categorias distintas atendidas por ativos</small></article>
      <Link href="/erp/suppliers/orders?status=Todos" className="supplier-metric-link"><span>Compras emitidas no mês</span><strong>{loading ? '—' : formatCurrency(metrics?.purchasesThisMonth)}</strong><small>{metrics?.purchaseOrdersThisMonth || 0} ordem(ns) reais, sem rascunhos/cancelamentos · Ver ordens</small></Link>
      <Link href="/erp/suppliers/orders?status=Pendentes" className={`supplier-metric-link ${metrics?.overduePurchaseOrders ? 'review' : ''}`}><span>Pedidos pendentes</span><strong>{loading ? '—' : metrics?.pendingPurchaseOrders ?? 0}</strong><small>{metrics?.overduePurchaseOrders || 0} em atraso, conforme data registrada · Ver pedidos</small></Link>
    </section>
    {notice && <div className="supplier-notice" role="status"><Check size={16} /> {notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {error && <div className="supplier-error" role="alert">{error}<button type="button" onClick={loadSuppliers}>Tentar novamente</button></div>}

    <section className="supplier-table-panel">
      <div className="supplier-tools">
        <label className="supplier-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, CNPJ, contato ou categoria" aria-label="Buscar fornecedores" /></label>
        <label className="supplier-category-filter"><span>Categoria</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="Todas">Todas</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      </div>
      <div className="supplier-status-tabs" role="tablist" aria-label="Filtrar fornecedores por status">{statusTabs.map((status) => <button key={status} type="button" role="tab" aria-selected={statusFilter === status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status} <span>{statusCounts[status]}</span></button>)}</div>

      {loading && <div className="supplier-empty-state"><Building2 size={26} /><strong>Carregando fornecedores</strong><span>Consultando registros persistidos no banco.</span></div>}
      {!loading && !error && !filteredSuppliers.length && <div className="supplier-empty-state"><Building2 size={28} /><strong>{suppliers.length ? 'Nenhum resultado encontrado' : 'Nenhum fornecedor cadastrado'}</strong><span>{suppliers.length ? 'Ajuste a busca ou os filtros.' : 'Cadastre fornecedores reais para iniciar a homologação. Nenhum registro demonstrativo foi criado.'}</span>{!suppliers.length && <button type="button" className="primary-cta" onClick={openCreate}><Plus size={15} /> Cadastrar fornecedor</button>}</div>}
      {!loading && !error && filteredSuppliers.length > 0 && <div className="supplier-table-scroll"><table className="supplier-table">
        <thead><tr><th>Fornecedor</th><th>CPF/CNPJ</th><th>Contato</th><th>Categorias</th><th>Status</th><th>Condições</th><th>Ações</th></tr></thead>
        <tbody>{filteredSuppliers.map((supplier) => <tr key={supplier.id}>
          <td><strong>{supplier.name}</strong><small>{supplier.legalName || supplier.id}</small></td>
          <td>{supplier.taxId || '—'}</td>
          <td><strong>{supplier.email || supplier.phone || '—'}</strong><small>{supplier.phone || supplier.whatsapp || 'Contato não informado'}</small></td>
          <td><div className="supplier-row-categories">{supplier.categories.length ? supplier.categories.map((category) => <span key={category}>{category}</span>) : '—'}</div></td>
          <td><span className={`supplier-status-badge ${supplier.status === 'Ativo' ? 'active' : supplier.status === 'Inativo' ? 'inactive' : 'review'}`}>{supplier.status}</span>{supplier.statusReason && <small className="supplier-reason">{supplier.statusReason}</small>}</td>
          <td>{supplier.paymentTerms || '—'}<small>{supplier.minimumOrderValue === null ? 'Mínimo não informado' : `Mínimo ${formatCurrency(supplier.minimumOrderValue)}`}</small></td>
          <td><button type="button" className="supplier-edit-button" onClick={() => openEdit(supplier)} aria-label={`Ver e editar ${supplier.name}`}><Pencil size={14} /> Ver / editar</button></td>
        </tr>)}</tbody>
      </table></div>}
      <footer className="supplier-table-footer">{loading ? ' ' : `${filteredSuppliers.length.toLocaleString('pt-BR')} fornecedor(es) nesta lista`}</footer>
    </section>
    {formOpen && <SupplierForm supplier={selectedSupplier} onClose={() => setFormOpen(false)} onSaved={onSaved} />}
  </div>;
}
