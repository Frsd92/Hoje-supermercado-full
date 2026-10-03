'use client';

import Link from 'next/link';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, Package, Pencil, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { expiryDateFromShelfLife } from '../api/inventory-lots.js';
import InventoryLotFormFields, { emptyLotForm, formatExpiryDate } from '../components/inventory-lot-form-fields.js';
import { EXPIRY_BANDS, getExpiryStatus, saoPauloDateString } from '../expiry.js';
import styles from './expiry-page.module.css';

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

function urgencyGroup(status) {
  if (status.key === 'overdue') return 'expired';
  if (status.key === 'missing' || status.key === 'invalid') return 'missing';
  if (status.key === 'not-tracked') return 'untracked';
  if (status.daysLeft <= 5) return 'critical';
  if (status.daysLeft <= 15) return 'soon';
  if (status.daysLeft <= 45) return 'upcoming';
  return 'safe';
}

function statusClassName(status) {
  const key = status.key.replaceAll('-', '_');
  return styles[`urgency_${key}`] || styles.urgency_missing;
}

function lotEditLink(lot) {
  return `/erp/products/cadastro?edit=${encodeURIComponent(lot.productExternalId)}&tab=estoque`;
}

export default function ERPExpiryPage() {
  const [lots, setLots] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [productFilter, setProductFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [today, setToday] = useState(() => saoPauloDateString());
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState(null);
  const [lotForm, setLotForm] = useState(emptyLotForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [formError, setFormError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/erp/validade', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os lotes de estoque.');
      if (!Array.isArray(data.lots) || !Array.isArray(data.products)) throw new Error('A resposta do monitoramento de lotes está inválida.');
      setLots(data.lots);
      setProducts(data.products);

      const requestedProduct = new URLSearchParams(window.location.search).get('productId');
      const selectedProduct = data.products.find((product) => product.id === requestedProduct || product.externalId === requestedProduct);
      if (selectedProduct) setProductFilter(selectedProduct.id);
    } catch (loadError) {
      console.error('Não foi possível carregar os lotes de estoque:', loadError);
      setError(loadError.message || 'Não foi possível carregar os lotes de estoque.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(saoPauloDateString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const lotsWithStatus = useMemo(() => lots.map((lot) => ({
    ...lot,
    expiryStatus: getExpiryStatus(lot.expiry, today, lot.controlsExpiry || lot.perishable),
  })), [lots, today]);

  const categories = useMemo(() => [...new Set(lotsWithStatus
    .flatMap((lot) => lot.categories || [])
    .filter(Boolean))].sort((first, second) => first.localeCompare(second, 'pt-BR')), [lotsWithStatus]);

  const counts = useMemo(() => {
    const result = { all: lotsWithStatus.length, expired: 0, critical: 0, soon: 0, upcoming: 0, missing: 0, safe: 0, untracked: 0 };
    lotsWithStatus.forEach((lot) => { result[urgencyGroup(lot.expiryStatus)] += 1; });
    return result;
  }, [lotsWithStatus]);

  const filteredLots = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return lotsWithStatus
      .filter((lot) => {
        const matchesQuery = !normalizedQuery || [
          lot.productTitle,
          lot.productSku,
          lot.lotCode,
          lot.location,
          ...(lot.categories || []),
        ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));
        const matchesCategory = category === 'Todas' || lot.categories?.includes(category);
        const matchesProduct = productFilter === 'Todas' || lot.productId === productFilter;
        const matchesStatus = statusFilter === 'all' || urgencyGroup(lot.expiryStatus) === statusFilter;
        return matchesQuery && matchesCategory && matchesProduct && matchesStatus;
      })
      .sort((first, second) => {
        const firstDays = first.expiryStatus.daysLeft ?? Number.POSITIVE_INFINITY;
        const secondDays = second.expiryStatus.daysLeft ?? Number.POSITIVE_INFINITY;
        return firstDays - secondDays
          || first.productTitle.localeCompare(second.productTitle, 'pt-BR')
          || first.lotCode.localeCompare(second.lotCode, 'pt-BR');
      });
  }, [lotsWithStatus, query, category, productFilter, statusFilter]);

  const metrics = [
    { key: 'all', label: 'Lotes com saldo', note: 'quantidades separadas por lote', icon: Package },
    { key: 'expired', label: 'Vencidos', note: 'retirar da área de venda', icon: ShieldAlert },
    { key: 'critical', label: 'Até 5 dias', note: 'ação imediata recomendada', icon: AlertTriangle },
    { key: 'soon', label: 'De 6 a 15 dias', note: 'planejar redução e giro', icon: Clock3 },
    { key: 'upcoming', label: 'De 16 a 45 dias', note: 'acompanhar diariamente', icon: CalendarDays },
    { key: 'missing', label: 'Sem validade', note: 'lotes controlados sem data', icon: AlertTriangle },
  ];

  const clearFilters = () => {
    setQuery('');
    setCategory('Todas');
    setProductFilter('Todas');
    setStatusFilter('all');
  };

  const hasFilters = query.trim() || category !== 'Todas' || productFilter !== 'Todas' || statusFilter !== 'all';
  const selectedProduct = products.find((product) => product.id === lotForm.productId);
  const calculatedExpiry = expiryDateFromShelfLife(lotForm.manufactureDate, lotForm.shelfLifeDays);
  const effectiveExpiry = lotForm.expiryMode === 'days' ? calculatedExpiry : lotForm.expiry;

  const openEditLot = (lot) => {
    setEditingLot(lot);
    setLotForm({
      productId: lot.productId,
      lotCode: lot.lotCode,
      quantity: String(lot.quantity),
      expiry: lot.expiry,
      manufactureDate: lot.manufactureDate,
      expiryMode: lot.shelfLifeDays ? 'days' : 'date',
      shelfLifeDays: lot.shelfLifeDays ? String(lot.shelfLifeDays) : '',
      location: lot.location,
    });
    setFormError('');
    setModalOpen(true);
  };

  const saveLot = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFeedback('');
    try {
      const response = await fetch('/api/erp/validade', {
        method: editingLot ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editingLot ? { lotId: editingLot.id } : { productId: lotForm.productId }),
          lotCode: lotForm.lotCode,
          quantity: Number(lotForm.quantity),
          expiry: effectiveExpiry,
          manufactureDate: lotForm.manufactureDate,
          expiryMode: lotForm.expiryMode,
          shelfLifeDays: lotForm.expiryMode === 'days' ? lotForm.shelfLifeDays : null,
          location: lotForm.location,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o lote.');
      setFeedback(editingLot ? 'Lote atualizado e saldo total recalculado.' : 'Lote registrado e saldo total atualizado.');
      setModalOpen(false);
      setEditingLot(null);
      setLotForm(emptyLotForm);
      await loadData();
    } catch (saveError) {
      console.error('Não foi possível salvar o lote de estoque:', saveError);
      setFormError(saveError.message || 'Não foi possível salvar o lote.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Operação · Estoque</span>
          <h1>Validade por lote</h1>
          <p>Cada entrada mantém sua própria quantidade, lote e validade. O saldo do cadastro é a soma dos lotes disponíveis.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.refreshButton} type="button" onClick={loadData} disabled={loading} aria-label={loading ? 'Atualizando lotes' : 'Atualizar lotes'}>
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </header>

      {feedback && <div className={styles.feedbackMessage} role="status"><CheckCircle2 size={17} aria-hidden="true" />{feedback}<button type="button" onClick={() => setFeedback('')} aria-label="Fechar aviso"><X size={15} /></button></div>}

      <section className={styles.metrics} aria-label="Resumo dos lotes">
        {metrics.map(({ key, label, note, icon: Icon }) => (
          <button
            className={`${styles.metricCard} ${styles[`metric_${key}`]} ${statusFilter === key ? styles.metricSelected : ''}`}
            type="button"
            key={key}
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter((current) => current === key ? 'all' : key)}
          >
            <span className={styles.metricIcon}><Icon size={18} aria-hidden="true" /></span>
            <span className={styles.metricValue}>{loading ? '—' : counts[key]}</span>
            <span className={styles.metricLabel}>{label}</span>
            <span className={styles.metricNote}>{note}</span>
          </button>
        ))}
      </section>

      <section className={styles.legendPanel} aria-labelledby="expiry-legend-heading">
        <div className={styles.legendHeading}>
          <div><h2>Urgência por lote</h2><p id="expiry-legend-heading">Cada faixa mostra o saldo daquele lote, não o estoque agregado do produto.</p></div>
          <span className={styles.legendContext}>Dias corridos · fuso de São Paulo</span>
        </div>
        <ul className={styles.legendList}>
          {EXPIRY_BANDS.map((band) => (
            <li className={`${styles.legendItem} ${statusClassName({ key: band.key })}`} key={band.key}>
              <span className={styles.legendSwatch} aria-hidden="true" />
              <span>{band.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.inventoryPanel} aria-label="Lotes de estoque monitorados">
        <div className={styles.inventoryHeading}>
          <div>
            <h2>Lotes com saldo</h2>
            <p aria-live="polite">{loading ? 'Carregando lotes...' : `${filteredLots.length.toLocaleString('pt-BR')} de ${lotsWithStatus.length.toLocaleString('pt-BR')} lote(s)`}</p>
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Buscar produto, SKU, lote ou localização</span>
            <Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou lote" />
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>Filtrar por produto</span>
            <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
              <option value="Todas">Todos os produtos</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.title} · {product.sku || product.externalId}</option>)}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>Filtrar por categoria</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="Todas">Todas as categorias</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className={styles.selectField}>
            <span className={styles.srOnly}>Filtrar por situação do lote</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todas as situações</option>
              <option value="expired">Vencidos</option>
              <option value="critical">Vencem em até 5 dias</option>
              <option value="soon">Vencem de 6 a 15 dias</option>
              <option value="upcoming">Vencem de 16 a 45 dias</option>
              <option value="safe">Dentro do prazo (mais de 45 dias)</option>
              <option value="missing">Sem validade cadastrada</option>
              <option value="untracked">Produto sem controle de validade</option>
            </select>
          </label>
          {hasFilters && <button className={styles.clearFilters} type="button" onClick={clearFilters}>Limpar filtros</button>}
        </div>

        {error && <div className={styles.errorMessage} role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span><button type="button" onClick={loadData}>Tentar novamente</button></div>}
        {loading && <div className={styles.emptyState} role="status">Carregando lotes e quantidades disponíveis...</div>}

        {!loading && !error && !lotsWithStatus.length && (
          <div className={styles.emptyState}>
            <CheckCircle2 size={24} aria-hidden="true" />
            <h3>Nenhum lote com saldo registrado</h3>
            <p>Use <strong>Registrar lote</strong> no menu lateral para lançar a primeira entrada. O saldo total do produto será calculado automaticamente.</p>
          </div>
        )}

        {!loading && !error && lotsWithStatus.length > 0 && !filteredLots.length && (
          <div className={styles.emptyState}>
            <Search size={22} aria-hidden="true" />
            <h3>Nenhum lote encontrado</h3>
            <p>Altere os filtros ou busque outro produto, lote ou localização.</p>
            <button type="button" onClick={clearFilters}>Limpar filtros</button>
          </div>
        )}

        {!loading && !error && filteredLots.length > 0 && (
          <>
            <div className={styles.listLabels} aria-hidden="true">
              <span>Produto / lote</span><span>Saldo do lote</span><span>Validade</span><span>Situação</span><span>Ação</span>
            </div>
            <ul className={styles.productList}>
              {filteredLots.map((lot) => {
                const urgency = lot.expiryStatus;
                const categoriesLabel = (lot.categories || []).join(', ');
                return (
                  <li className={`${styles.productItem} ${statusClassName(urgency)}`} key={lot.id}>
                    <div className={styles.productIdentity}>
                      <span className={styles.productIcon}><Package size={19} aria-hidden="true" /></span>
                      <span className={styles.productNameGroup}>
                        <Link className={styles.productName} href={lotEditLink(lot)}>{lot.productTitle}</Link>
                        <span className={styles.productMetadata}>
                          {[lot.productSku, lot.lotCode && `Lote ${lot.lotCode}`, categoriesLabel, lot.location].filter(Boolean).join(' · ') || 'Sem SKU, lote ou localização'}
                        </span>
                      </span>
                    </div>
                    <div className={styles.productStock} data-label="Saldo do lote">
                      <strong>{quantityFormatter.format(lot.quantity)} {lot.saleUnit}</strong>
                    </div>
                    <div className={styles.productExpiry} data-label="Validade">
                      <strong>{formatExpiryDate(lot.expiry)}</strong>
                      {lot.manufactureDate && <span>Fabricado em {formatExpiryDate(lot.manufactureDate)}</span>}
                    </div>
                    <div className={styles.productUrgency} data-label="Situação">
                      <span className={styles.statusBadge}>{urgency.label}</span>
                      <span className={styles.statusDetail}>{urgency.detail}</span>
                    </div>
                    <div className={styles.productAction} data-label="Ação">
                      <button type="button" onClick={() => openEditLot(lot)} aria-label={`Alterar lote ${lot.lotCode || ''} de ${lot.productTitle}`}><Pencil size={14} aria-hidden="true" /> Alterar</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {modalOpen && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false); }}>
          <section className={styles.lotDialog} role="dialog" aria-modal="true" aria-labelledby="inventory-lot-dialog-title">
            <header className={styles.dialogHeader}>
              <div>
                <span className={styles.eyebrow}>{editingLot ? 'Ajuste de estoque' : 'Entrada de estoque'}</span>
                <h2 id="inventory-lot-dialog-title">{editingLot ? 'Alterar lote' : 'Registrar lote'}</h2>
                <p>{editingLot ? 'Defina o saldo físico atual e os dados corretos deste lote.' : 'Informe a fabricação e o prazo em dias, ou digite a validade impressa no lote.'}</p>
              </div>
              <button type="button" className={styles.dialogClose} aria-label="Fechar" onClick={() => setModalOpen(false)} disabled={saving}><X size={20} /></button>
            </header>
            <form className={styles.lotForm} onSubmit={saveLot}>
              <InventoryLotFormFields
                products={products}
                lotForm={lotForm}
                setLotForm={setLotForm}
                selectedProduct={selectedProduct}
                effectiveExpiry={effectiveExpiry}
                editingLot={editingLot}
                formError={formError}
              />
              <footer className={`${styles.dialogActions} ${styles.formWide}`}>
                <button type="button" className={styles.refreshButton} onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</button>
                <button type="submit" className={styles.addButton} disabled={saving || !products.length}>{saving ? 'Salvando...' : editingLot ? 'Salvar lote e recalcular saldo' : 'Registrar entrada'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
