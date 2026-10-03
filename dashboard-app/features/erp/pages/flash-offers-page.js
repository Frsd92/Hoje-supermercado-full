'use client';

import { CalendarClock, Clock3, ExternalLink, Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { matchesProductSearch } from '../api/product-search.js';
import styles from './flash-offers-page.module.css';

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').replace(/[^0-9,.-]/g, '');
  const decimalValue = normalized.includes(',')
    ? normalized.replace(/\./g, '').replace(',', '.')
    : normalized;
  return Number(decimalValue) || 0;
}

function formatDateTime(value) {
  if (!value) return 'Não definido';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não definido' : date.toLocaleString('pt-BR');
}

function formatCompactDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getOfferState(product) {
  return product.flashOfferEnabled ? product.flashOfferStatus : 'disabled';
}

function getOfferWindowLabel(product) {
  if (!product.flashOfferEnabled) return '';
  if (product.flashOfferStatus === 'active') return `Até ${formatCompactDateTime(product.flashOfferEnd)}`;
  if (product.flashOfferStatus === 'scheduled') {
    return `De ${formatCompactDateTime(product.flashOfferStart)} a ${formatCompactDateTime(product.flashOfferEnd)}`;
  }
  if (product.flashOfferStatus === 'expired') return `Encerrou ${formatCompactDateTime(product.flashOfferEnd)}`;
  return '';
}

function toDateTimeLocal(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultEndTime() {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  date.setSeconds(0, 0);
  return toDateTimeLocal(date);
}

function getRegularPrice(product) {
  const promotionalPrice = parsePrice(product?.promotionalPrice);
  if (promotionalPrice > 0) return promotionalPrice;
  const price = parsePrice(product?.price);
  const discount = Math.min(100, Math.max(0, parsePrice(product?.discount)));
  return Math.round(price * (1 - discount / 100) * 100) / 100;
}

function getStatusLabel(product) {
  if (!product.flashOfferEnabled) return 'Desativada';
  return {
    active: 'Ativa',
    scheduled: 'Agendada',
    expired: 'Encerrada',
    invalid: 'Revisar dados',
  }[product.flashOfferStatus] || 'Revisar dados';
}

function getStatusClass(product) {
  if (!product.flashOfferEnabled) return styles.statusDisabled;
  return {
    active: styles.statusActive,
    scheduled: styles.statusScheduled,
    expired: styles.statusExpired,
    invalid: styles.statusInvalid,
  }[product.flashOfferStatus] || styles.statusInvalid;
}

export default function FlashOffersPage() {
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [offerFilter, setOfferFilter] = useState('all');
  const [flashPrice, setFlashPrice] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch('/api/products?purpose=flash-admin', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os produtos.');
        if (!Array.isArray(data.products)) throw new Error('A resposta de produtos está inválida.');
        if (active) {
          setProducts(data.products);
          setSelectedId((current) => current || String(data.products[0]?.id || ''));
        }
      })
      .catch((error) => {
        if (active) {
          setFeedback(error.message);
          setFeedbackError(true);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedProduct = products.find((product) => String(product.id) === selectedId);
  const filteredProducts = useMemo(() => {
    const statusPriority = { active: 0, scheduled: 1, expired: 2, invalid: 3, disabled: 4 };
    return products
      .filter((product) => (
        (offerFilter === 'all' || getOfferState(product) === offerFilter)
        && matchesProductSearch(product, search)
      ))
      .sort((first, second) => (
        (statusPriority[getOfferState(first)] ?? 4)
        - (statusPriority[getOfferState(second)] ?? 4)
        || String(first.title).localeCompare(String(second.title), 'pt-BR')
      ));
  }, [offerFilter, products, search]);

  const totals = useMemo(() => products.reduce((result, product) => {
    const state = getOfferState(product);
    if (result[state] !== undefined) result[state] += 1;
    return result;
  }, { active: 0, scheduled: 0, expired: 0, invalid: 0, disabled: 0 }), [products]);
  const filterOptions = [
    { value: 'all', label: 'Todos', count: products.length },
    { value: 'active', label: 'Ativas', count: totals.active },
    { value: 'scheduled', label: 'Agendadas', count: totals.scheduled },
    { value: 'expired', label: 'Encerradas', count: totals.expired },
    { value: 'invalid', label: 'Revisar', count: totals.invalid },
    { value: 'disabled', label: 'Sem oferta', count: totals.disabled },
  ];
  const hasActiveFilters = search.trim() || offerFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setOfferFilter('all');
  };

  useEffect(() => {
    if (!selectedProduct) return;
    setFlashPrice(selectedProduct.flashOfferPrice > 0 ? String(selectedProduct.flashOfferPrice) : '');
    const hasFutureWindow = Date.parse(selectedProduct.flashOfferEnd) > Date.now()
      && Date.parse(selectedProduct.flashOfferStart) < Date.parse(selectedProduct.flashOfferEnd);
    setStartsAt(toDateTimeLocal(hasFutureWindow ? selectedProduct.flashOfferStart : new Date()));
    setEndsAt(toDateTimeLocal(hasFutureWindow ? selectedProduct.flashOfferEnd : defaultEndTime()));
  }, [selectedId, products, selectedProduct]);

  const persistOffer = async (enabled) => {
    if (!selectedProduct) return;
    setSaving(true);
    setFeedback('');
    setFeedbackError(false);
    try {
      const payload = { purpose: 'flash-admin', id: selectedProduct.id, flashOfferEnabled: enabled };
      if (enabled) {
        const price = Number(String(flashPrice).replace(',', '.'));
        const start = new Date(startsAt);
        const end = new Date(endsAt);
        if (!Number.isFinite(price) || price <= 0 || price >= getRegularPrice(selectedProduct)) {
          throw new Error('O preço relâmpago deve ser menor que o preço de venda atual.');
        }
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
          throw new Error('Informe um início e um término válidos para a oferta.');
        }
        payload.flashOfferPrice = price;
        payload.flashOfferStart = start.toISOString();
        payload.flashOfferEnd = end.toISOString();
      }

      const response = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a oferta.');

      const refreshResponse = await fetch('/api/products?purpose=flash-admin', { cache: 'no-store' });
      const refreshData = await refreshResponse.json();
      if (!refreshResponse.ok) throw new Error(refreshData.error || 'A oferta foi salva, mas a lista não pôde ser atualizada.');
      setProducts(refreshData.products);
      const refreshedProduct = refreshData.products.find((product) => String(product.id) === selectedId);
      const startsInFuture = startsAt && new Date(startsAt).getTime() > Date.now();
      setFeedback(enabled
        ? startsInFuture
          ? `Oferta agendada para ${refreshedProduct?.title || selectedProduct.title}.`
          : `Oferta ativada para ${refreshedProduct?.title || selectedProduct.title}.`
        : `Oferta desativada para ${selectedProduct.title}.`);
    } catch (error) {
      setFeedback(error.message || 'Não foi possível atualizar a oferta.');
      setFeedbackError(true);
    } finally {
      setSaving(false);
    }
  };

  return <div className="erp-module-page">
    <div className="erp-customer-header">
      <div>
        <span className="eyebrow">Gestão comercial</span>
        <h1>Ofertas Relâmpago</h1>
        <p>Agende um preço especial por produto. Ao terminar o período, o preço de venda volta automaticamente ao valor regular.</p>
      </div>
      <div className={styles.headerActions}>
        <a className={styles.storePreviewLink} href="/categoria.html?categoria=ofertas-relampago" target="_blank" rel="noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> Ver vitrine da Loja
        </a>
      </div>
    </div>

    <div className={styles.summary} aria-label="Resumo das ofertas relâmpago">
      <div className={styles.summaryCard}><span>Ativas agora</span><strong>{totals.active}</strong></div>
      <div className={styles.summaryCard}><span>Agendadas</span><strong>{totals.scheduled}</strong></div>
      <div className={styles.summaryCard}><span>Encerradas</span><strong>{totals.expired}</strong></div>
    </div>

    {feedback && <p className={`${styles.feedback} ${feedbackError ? styles.feedbackError : ''}`} role={feedbackError ? 'alert' : 'status'}>{feedback}</p>}

    <div className={styles.managerGrid}>
      <section className={`editor-card ${styles.productPanel}`} aria-labelledby="flash-products-title">
        <div className={styles.panelHeading}>
          <div><h2 id="flash-products-title">Produtos e ofertas</h2><p>Confira os preços e períodos ativos ou agendados, ou escolha um produto para configurar.</p></div>
          <span className={styles.resultCount} aria-label={`${filteredProducts.length} produtos exibidos`}>{filteredProducts.length}</span>
        </div>
        <label className={styles.search} htmlFor="flash-products-search">
          <Search size={17} aria-hidden="true" />
          <span className={styles.visuallyHidden}>Buscar por nome, código de barras, SKU, categoria ou departamento</span>
          <input
            id="flash-products-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, código de barras, SKU, categoria ou departamento"
            autoComplete="off"
          />
        </label>
        <div className={styles.filterGroup} role="group" aria-label="Filtrar produtos pelo status da oferta">
          {filterOptions.map((filter) => <button
            key={filter.value}
            className={styles.filterButton}
            type="button"
            aria-pressed={offerFilter === filter.value}
            onClick={() => setOfferFilter(filter.value)}
          >
            {filter.label}<span>{filter.count}</span>
          </button>)}
        </div>
        <div className={styles.resultsSummary}>
          <span role="status" aria-live="polite">
            {filteredProducts.length} {filteredProducts.length === 1 ? 'produto exibido' : 'produtos exibidos'}
            {hasActiveFilters ? ` de ${products.length}` : ''}
          </span>
          {hasActiveFilters && <button type="button" className={styles.clearFilters} onClick={clearFilters}>Limpar filtros</button>}
        </div>
        <div className={styles.productList} aria-label="Produtos disponíveis">
          {loading ? <p className={styles.emptyState} role="status">Carregando produtos...</p>
            : !products.length ? <p className={styles.emptyState}>Nenhum produto cadastrado para configurar uma oferta.</p>
            : filteredProducts.length ? filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                className={`${styles.productOption} ${String(product.id) === selectedId ? styles.productOptionSelected : ''}`}
                aria-pressed={String(product.id) === selectedId}
                onClick={() => setSelectedId(String(product.id))}
              >
                <span className={styles.productName}>{product.title}</span>
                <span className={styles.productMeta}>
                  <span className={styles.productPrices}>
                    <span className={styles.regularPrice}>Regular: {formatCurrency(getRegularPrice(product))}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}</span>
                    {product.flashOfferEnabled && <strong className={styles.flashPrice}>Relâmpago: {formatCurrency(product.flashOfferPrice)}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}</strong>}
                    {getOfferWindowLabel(product) && <span className={styles.offerWindow}>{getOfferWindowLabel(product)}</span>}
                  </span>
                  <span className={`${styles.status} ${getStatusClass(product)}`}>{getStatusLabel(product)}</span>
                </span>
              </button>
            )) : <div className={styles.emptyState}>
              <p>Nenhum produto corresponde aos filtros selecionados.</p>
              <button className={styles.clearFilters} type="button" onClick={clearFilters}>Limpar filtros</button>
            </div>}
        </div>
      </section>

      <section className={`editor-card ${styles.formPanel}`} aria-labelledby="flash-editor-title">
        {selectedProduct ? <>
          <div className={styles.panelHeading}>
            <div><h2 id="flash-editor-title">{selectedProduct.title}</h2><p>Configure o preço e a janela de validade da oferta.</p></div>
            <Zap className={styles.headingIcon} size={22} aria-hidden="true" />
          </div>
          {!filteredProducts.some((product) => String(product.id) === selectedId) && <p className={styles.selectionContext} role="note">
            Este produto permanece selecionado, mas está fora dos filtros aplicados à lista.
          </p>}
          <div className={styles.priceSummary}>
            <span>Preço de venda fora da oferta</span>
            <strong>{formatCurrency(getRegularPrice(selectedProduct))}{selectedProduct.saleUnit === 'Quilograma' ? ' / kg' : ''}</strong>
          </div>
          <form onSubmit={(event) => { event.preventDefault(); persistOffer(true); }}>
            <label className={styles.field}>
              Preço relâmpago (R$)
              <input
                type="number"
                min="0.01"
                max={Math.max(0, getRegularPrice(selectedProduct) - 0.01).toFixed(2)}
                step="0.01"
                inputMode="decimal"
                value={flashPrice}
                onChange={(event) => setFlashPrice(event.target.value)}
                placeholder="Ex.: 9,90"
                required
              />
              <small>Precisa ser menor que o preço de venda atual. A unidade do produto é mantida.</small>
            </label>
            <div className={styles.dateGrid}>
              <label className={styles.field}>
                <span><CalendarClock size={15} aria-hidden="true" /> Início</span>
                <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
              </label>
              <label className={styles.field}>
                <span><Clock3 size={15} aria-hidden="true" /> Término</span>
                <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
              </label>
            </div>
            <p className={styles.scheduleHint}>Horários no fuso local do seu dispositivo. O preço regular volta automaticamente no término.</p>
            {selectedProduct.status !== 'Ativo' && <p className={styles.inactiveWarning} role="note">Este produto está {selectedProduct.status?.toLowerCase() || 'inativo'} no catálogo e não pode receber uma nova oferta ativa.</p>}
            <button className={styles.primaryButton} type="submit" disabled={saving || loading || selectedProduct.status !== 'Ativo'}>
              <Zap size={17} aria-hidden="true" /> {saving ? 'Salvando...' : startsAt && new Date(startsAt).getTime() > Date.now() ? 'Salvar e agendar oferta' : 'Ativar oferta'}
            </button>
          </form>
          {selectedProduct.flashOfferEnabled && <button className={styles.disableButton} type="button" onClick={() => persistOffer(false)} disabled={saving}>
            {saving ? 'Salvando...' : 'Desativar oferta'}
          </button>}
          <div className={styles.currentStatus}>
            <span className={`${styles.status} ${getStatusClass(selectedProduct)}`}>{getStatusLabel(selectedProduct)}</span>
            {selectedProduct.flashOfferEnabled && <>
              <span>Preço configurado: <strong>{formatCurrency(selectedProduct.flashOfferPrice)}</strong></span>
              <span>Início: {formatDateTime(selectedProduct.flashOfferStart)}</span>
              <span>Término: {formatDateTime(selectedProduct.flashOfferEnd)}</span>
            </>}
          </div>
        </> : <div className={styles.emptyState}>{loading ? 'Carregando produtos...' : 'Selecione um produto para configurar a oferta.'}</div>}
      </section>
    </div>
  </div>;
}
