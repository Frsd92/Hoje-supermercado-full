'use client';

import { CalendarClock, Clock3, Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const statusPriority = { active: 0, scheduled: 1, expired: 2, invalid: 3, disabled: 4 };
    return products
      .filter((product) => !query || String(product.title || '').toLocaleLowerCase('pt-BR').includes(query))
      .sort((first, second) => (
        (statusPriority[first.flashOfferEnabled ? first.flashOfferStatus : 'disabled'] ?? 4)
        - (statusPriority[second.flashOfferEnabled ? second.flashOfferStatus : 'disabled'] ?? 4)
        || String(first.title).localeCompare(String(second.title), 'pt-BR')
      ));
  }, [products, search]);

  const totals = products.reduce((result, product) => {
    if (product.flashOfferEnabled && product.flashOfferStatus === 'active') result.active += 1;
    if (product.flashOfferEnabled && product.flashOfferStatus === 'scheduled') result.scheduled += 1;
    if (product.flashOfferEnabled && product.flashOfferStatus === 'expired') result.expired += 1;
    return result;
  }, { active: 0, scheduled: 0, expired: 0 });

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
          <div><h2 id="flash-products-title">Produtos</h2><p>Escolha um produto para configurar ou acompanhar uma oferta.</p></div>
          <span className={styles.resultCount}>{filteredProducts.length}</span>
        </div>
        <label className={styles.search}>
          <Search size={17} aria-hidden="true" />
          <span className={styles.visuallyHidden}>Buscar produto</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar produto pelo nome" />
        </label>
        <div className={styles.productList} aria-label="Produtos disponíveis">
          {loading ? <p className={styles.emptyState}>Carregando produtos...</p>
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
                  <span>{formatCurrency(getRegularPrice(product))}</span>
                  <span className={`${styles.status} ${getStatusClass(product)}`}>{getStatusLabel(product)}</span>
                </span>
              </button>
            )) : <p className={styles.emptyState}>Nenhum produto encontrado para esta busca.</p>}
        </div>
      </section>

      <section className={`editor-card ${styles.formPanel}`} aria-labelledby="flash-editor-title">
        {selectedProduct ? <>
          <div className={styles.panelHeading}>
            <div><h2 id="flash-editor-title">{selectedProduct.title}</h2><p>Configure o preço e a janela de validade da oferta.</p></div>
            <Zap className={styles.headingIcon} size={22} aria-hidden="true" />
          </div>
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
    <p className={styles.storeLink}><a href="/categoria.html?categoria=ofertas-relampago" target="_blank" rel="noreferrer">Abrir a vitrine de Ofertas Relâmpago da Loja</a></p>
  </div>;
}
