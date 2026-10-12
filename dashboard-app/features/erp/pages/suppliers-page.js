'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  neighborhood: '',
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
  neighborhood: 'Bairro',
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
const formatBrazilDocument = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};
const formatPostalCode = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};
const stateOptions = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'],
  ['CE', 'Ceará'], ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'],
  ['MA', 'Maranhão'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'],
  ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'], ['PE', 'Pernambuco'], ['PI', 'Piauí'],
  ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'], ['RS', 'Rio Grande do Sul'],
  ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];

function formatAuditValue(value) {
  if (value && typeof value === 'object' && value.__auditAbsent === true) return 'Não informado';
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function readSupplierResponse(response, fallbackMessage) {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(fallbackMessage);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function normalizeSupplierSearch(value) {
  return String(value || '')
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(supplier || emptySupplier);
  const [categoryInput, setCategoryInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [audit, setAudit] = useState([]);
  const [auditError, setAuditError] = useState('');
  const [cnpjLookup, setCnpjLookup] = useState({ loading: false, message: '' });
  const [cepLookup, setCepLookup] = useState({ loading: false, message: '' });
  const isEditing = Boolean(supplier?.id);
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const savingRef = useRef(saving);
  const cnpjRequestRef = useRef(0);
  const cepRequestRef = useRef(0);
  closeRef.current = onClose;
  savingRef.current = saving;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const firstField = dialogRef.current?.querySelector('#supplier-name');
    firstField?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!savingRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = [...dialogRef.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.getClientRects().length);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!supplier?.id) return;
    let active = true;
    fetch(`/api/erp/suppliers/audit?supplierId=${encodeURIComponent(supplier.id)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await readSupplierResponse(response, 'Não foi possível carregar a auditoria.');
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a auditoria.');
        if (active) setAudit(data.entries || []);
      })
      .catch((loadError) => {
        if (active) setAuditError(loadError.message || 'Não foi possível carregar a auditoria.');
      });
    return () => { active = false; };
  }, [supplier?.id]);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const lookupSupplierCnpj = async (value) => {
    const requestId = ++cnpjRequestRef.current;
    setCnpjLookup({ loading: true, message: 'Consultando dados públicos do CNPJ…' });
    try {
      const response = await fetch(`/api/erp/suppliers/lookup?type=cnpj&value=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const data = await readSupplierResponse(response, 'Não foi possível consultar este CNPJ.');
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar este CNPJ.');
      if (requestId !== cnpjRequestRef.current) return;
      setForm((current) => Object.fromEntries(Object.entries(current).map(([key, existing]) => {
        const suggestion = data[key];
        if (typeof suggestion !== 'string' || !suggestion.trim() || String(existing || '').trim()) return [key, existing];
        return [key, key === 'postalCode' ? formatPostalCode(suggestion) : suggestion];
      })));
      setCnpjLookup({ loading: false, message: 'Dados públicos encontrados. Confira e complete os campos antes de salvar.' });
    } catch (lookupError) {
      if (requestId === cnpjRequestRef.current) setCnpjLookup({ loading: false, message: lookupError.message || 'Consulta indisponível; preencha os dados manualmente.' });
    }
  };
  const lookupSupplierCep = async (value) => {
    const requestId = ++cepRequestRef.current;
    setCepLookup({ loading: true, message: 'Consultando o CEP…' });
    try {
      const response = await fetch(`/api/erp/suppliers/lookup?type=cep&value=${encodeURIComponent(value)}`, { cache: 'no-store' });
      const data = await readSupplierResponse(response, 'Não foi possível consultar este CEP.');
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar este CEP.');
      if (requestId !== cepRequestRef.current) return;
      setForm((current) => ({
        ...current,
        address: data.address || current.address,
        neighborhood: data.neighborhood || current.neighborhood,
        city: data.city || current.city,
        state: data.state || current.state,
        postalCode: formatPostalCode(data.postalCode || value),
      }));
      setCepLookup({ loading: false, message: 'Endereço localizado pelo CEP. Confira o número e o complemento.' });
    } catch (lookupError) {
      if (requestId === cepRequestRef.current) setCepLookup({ loading: false, message: lookupError.message || 'Consulta indisponível; preencha o endereço manualmente.' });
    }
  };
  const handleTaxIdChange = (event) => {
    const formatted = formatBrazilDocument(event.target.value);
    updateField('taxId', formatted);
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 14) lookupSupplierCnpj(digits);
    else {
      cnpjRequestRef.current += 1;
      setCnpjLookup({ loading: false, message: '' });
    }
  };
  const handlePostalCodeChange = (event) => {
    const formatted = formatPostalCode(event.target.value);
    updateField('postalCode', formatted);
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 8) lookupSupplierCep(digits);
    else {
      cepRequestRef.current += 1;
      setCepLookup({ loading: false, message: '' });
    }
  };
  const addCategories = () => {
    const added = categoryInput.split(',').map((item) => item.trim()).filter(Boolean);
    if (!added.length) return;
    const normalizeCategory = (item) => normalizeSupplierSearch(item).trim();
    const existing = new Set((form.categories || []).map(normalizeCategory));
    const uniqueAdded = added.filter((item) => {
      const normalized = normalizeCategory(item);
      if (existing.has(normalized)) return false;
      existing.add(normalized);
      return true;
    });
    updateField('categories', [...(form.categories || []), ...uniqueAdded]);
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
        }),
      });
      const data = await readSupplierResponse(response, 'Não foi possível salvar o fornecedor. Tente novamente.');
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

  const field = (label, key, type = 'text', props = {}) => {
    const id = `supplier-${key}`;
    return <div key={key} className={`supplier-field ${props.className || ''}`}>
      <label htmlFor={id}>{label}{props.required && <span aria-hidden="true"> *</span>}</label>
      <input
        id={id}
        type={type}
        value={form[key] ?? ''}
        onChange={props.onChange || ((event) => updateField(key, event.target.value))}
        required={props.required}
        maxLength={props.maxLength}
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        min={props.min}
        step={props.step}
        autoComplete={props.autoComplete}
        aria-describedby={props.hint ? `${id}-hint` : undefined}
      />
      {props.hint && <small id={`${id}-hint`} className="supplier-field-hint">{props.hint}</small>}
    </div>;
  };

  return <div className="supplier-drawer-backdrop">
    <section ref={dialogRef} className="supplier-drawer" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title" aria-describedby="supplier-form-description" tabIndex="-1">
      <header className="supplier-drawer-header"><div><span className="eyebrow">Cadastro de fornecedores</span><h2 id="supplier-form-title">{isEditing ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</h2><p id="supplier-form-description">Informe os dados confirmados. Campos sem asterisco são opcionais; novos cadastros começam em análise.</p></div><button type="button" className="supplier-close-button" aria-label="Fechar formulário" onClick={onClose} disabled={saving}><X size={20} /></button></header>
      <form className="supplier-form" onSubmit={save}>
        <section className="supplier-form-section"><h3>Identificação e contato</h3><p className="supplier-section-description">A consulta automática usa fontes públicas para sugerir dados do CNPJ; revise as informações antes de salvar.</p><div className="supplier-form-grid">
          {field('Nome fantasia', 'name', 'text', { required: true, autoComplete: 'organization' })}
          {field('Razão social', 'legalName')}
          {field('CPF/CNPJ', 'taxId', 'text', { inputMode: 'numeric', placeholder: 'Digite ou cole o documento', autoComplete: 'off', onChange: handleTaxIdChange, hint: cnpjLookup.message || 'Ao completar um CNPJ válido, buscamos os dados públicos da empresa; confira as sugestões.' })}
          {field('E-mail geral', 'email', 'email')}
          {field('Telefone', 'phone', 'tel')}
          {field('WhatsApp', 'whatsapp', 'tel')}
        </div></section>

        <section className="supplier-form-section"><h3 id="supplier-categories-title">Categorias atendidas</h3><p className="supplier-section-description">Adicione uma ou mais categorias separadas por vírgula. Pressione Enter ou use Adicionar.</p><div className="supplier-category-entry"><label className="visually-hidden" htmlFor="supplier-category-input">Nova categoria</label><input id="supplier-category-input" value={categoryInput} onChange={(event) => setCategoryInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addCategories(); } }} placeholder="Ex.: Hortifruti, limpeza" /><button type="button" onClick={addCategories} disabled={!categoryInput.trim()}>Adicionar</button></div>{(form.categories || []).length > 0 ? <ul className="supplier-category-tags" aria-labelledby="supplier-categories-title">{form.categories.map((category) => <li key={category}><span>{category}</span><button type="button" aria-label={`Remover categoria ${category}`} onClick={() => updateField('categories', form.categories.filter((item) => item !== category))}>×</button></li>)}</ul> : <p className="supplier-category-empty">Nenhuma categoria adicionada.</p>}</section>

        <section className="supplier-form-section"><h3>Homologação</h3><div className="supplier-form-grid">
          <div className="supplier-field"><label htmlFor="supplier-status">Status</label><select id="supplier-status" value={form.status} onChange={(event) => updateField('status', event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></div>
          <div className="supplier-field supplier-form-wide"><label htmlFor="supplier-status-reason">Motivo / observações da análise</label><textarea id="supplier-status-reason" rows="2" value={form.statusReason || ''} onChange={(event) => updateField('statusReason', event.target.value)} placeholder="Registre pendências ou o motivo da mudança de status." /></div>
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
          {field('CEP', 'postalCode', 'text', { inputMode: 'numeric', maxLength: 9, placeholder: '00000-000', onChange: handlePostalCodeChange, hint: cepLookup.message || 'Ao completar os oito dígitos, o endereço é preenchido automaticamente.' })}
          {field('Endereço', 'address')}
          {field('Bairro', 'neighborhood')}
          {field('Cidade', 'city')}
          <div className="supplier-field"><label htmlFor="supplier-state">UF</label><select id="supplier-state" value={form.state || ''} onChange={(event) => updateField('state', event.target.value)}><option value="">Selecione a UF</option>{stateOptions.map(([uf, name]) => <option key={uf} value={uf}>{name} ({uf})</option>)}</select></div>
          {field('Condições de pagamento', 'paymentTerms', 'text', { placeholder: 'Ex.: 28 dias, boleto' })}
          {field('Pedido mínimo (R$)', 'minimumOrderValue', 'text', { inputMode: 'decimal', placeholder: 'Ex.: 1.234,56', hint: 'Use vírgula para separar os centavos.' })}
          {field('Condições de entrega', 'deliveryTerms', 'text', { placeholder: 'Ex.: CIF ou FOB, conforme negociado' })}
        </div></section>

        {error && <div className="supplier-form-error" role="alert" tabIndex="-1">{error}</div>}
        <footer className="supplier-form-actions"><button type="button" className="supplier-secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-cta" disabled={saving}>{saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Cadastrar em análise'}</button></footer>
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
      const data = await readSupplierResponse(response, 'Não foi possível carregar fornecedores. Tente novamente.');
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
    const normalizedQuery = normalizeSupplierSearch(query.trim());
    const numericQuery = normalizedQuery.replace(/\D/g, '');
    return suppliers.filter((supplier) => {
      const searchableValues = [
        supplier.name, supplier.legalName, supplier.email, supplier.phone, supplier.whatsapp,
        supplier.contactName, supplier.contactPhone, supplier.id, ...(supplier.categories || []),
      ];
      const matchesQuery = !normalizedQuery
        || searchableValues.some((value) => normalizeSupplierSearch(value).includes(normalizedQuery))
        || (numericQuery.length > 0 && String(supplier.taxId || '').replace(/\D/g, '').includes(numericQuery));
      return matchesQuery
        && (statusFilter === 'Todos' || supplier.status === statusFilter)
        && (categoryFilter === 'Todas' || supplier.categories.includes(categoryFilter));
    });
  }, [suppliers, query, statusFilter, categoryFilter]);

  const saveCsv = () => {
    const columns = ['Nome fantasia', 'Razão social', 'CPF/CNPJ', 'E-mail', 'Telefone', 'WhatsApp', 'Categorias', 'Status', 'Motivo', 'Endereço', 'Bairro', 'Cidade', 'UF', 'CEP', 'Condições de pagamento', 'Pedido mínimo', 'Condições de entrega'];
    const rows = filteredSuppliers.map((supplier) => [
      supplier.name, supplier.legalName, supplier.taxId, supplier.email, supplier.phone, supplier.whatsapp,
      supplier.categories.join('; '), supplier.status, supplier.statusReason, supplier.address, supplier.neighborhood, supplier.city, supplier.state, supplier.postalCode,
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

    <nav className="supplier-subnav" aria-label="Módulos de abastecimento"><span className="active" aria-current="page">Fornecedores</span><Link href="/erp/suppliers/orders">Ordens de compra</Link></nav>
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
      <div className="supplier-status-tabs" role="group" aria-label="Filtrar fornecedores por status">{statusTabs.map((status) => <button key={status} type="button" aria-pressed={statusFilter === status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status} <span aria-label={`${statusCounts[status]} fornecedores`}>{statusCounts[status]}</span></button>)}</div>

      {loading && <div className="supplier-empty-state"><Building2 size={26} /><strong>Carregando fornecedores</strong><span>Consultando registros persistidos no banco.</span></div>}
      {!loading && !error && !filteredSuppliers.length && <div className="supplier-empty-state"><Building2 size={28} /><strong>{suppliers.length ? 'Nenhum resultado encontrado' : 'Nenhum fornecedor cadastrado'}</strong><span>{suppliers.length ? 'Ajuste a busca ou os filtros.' : 'Cadastre fornecedores reais para iniciar a homologação. Nenhum registro demonstrativo foi criado.'}</span>{suppliers.length > 0 ? <button type="button" className="supplier-secondary-button" onClick={() => { setQuery(''); setStatusFilter('Todos'); setCategoryFilter('Todas'); }}>Limpar filtros</button> : <button type="button" className="primary-cta" onClick={openCreate}><Plus size={15} /> Cadastrar fornecedor</button>}</div>}
      {!loading && !error && filteredSuppliers.length > 0 && <div className="supplier-table-scroll" role="region" aria-label="Lista de fornecedores. Em telas estreitas, role horizontalmente para ver todas as colunas." tabIndex="0"><table className="supplier-table">
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
