'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { INVENTORY_COUNT_CATEGORIES, normalizeInventoryCountLabel } from '../inventory-count-categories.js';
import styles from './inventory-count-page.module.css';

const API_PATH = '/api/erp/inventory-count';
const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const countDateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatQuantity(value) {
  return quantityFormatter.format(Number(value) || 0);
}

function formatDifference(value) {
  const quantity = Number(value) || 0;
  return quantity > 0 ? `+${formatQuantity(quantity)}` : formatQuantity(quantity);
}

function formatCountDate(value) {
  return value ? countDateFormatter.format(new Date(value)) : '';
}

function draftValueFor(item, draftValues) {
  if (Object.prototype.hasOwnProperty.call(draftValues, item.id)) return draftValues[item.id];
  return item.countedQuantity === null ? '' : String(item.countedQuantity);
}

function quantityToMilliUnits(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const quantity = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const scaledQuantity = quantity * 1000;
  const roundedQuantity = Math.round(scaledQuantity);
  if (Math.abs(scaledQuantity - roundedQuantity) >= 1e-7 || roundedQuantity > 999_999_999_999) return null;
  return roundedQuantity;
}

function buildCountChanges(count, draftValues) {
  const changes = [];
  let invalid = false;

  for (const item of count?.items || []) {
    const value = draftValueFor(item, draftValues).trim();
    if (!value && item.countedQuantity === null) continue;
    if (!value) {
      changes.push({ id: item.id, countedQuantity: null });
      continue;
    }

    const quantityMilliUnits = quantityToMilliUnits(value);
    if (quantityMilliUnits === null) {
      invalid = true;
      continue;
    }
    const savedMilliUnits = item.countedQuantity === null ? null : Math.round(item.countedQuantity * 1000);
    if (quantityMilliUnits !== savedMilliUnits) {
      changes.push({ id: item.id, countedQuantity: quantityMilliUnits / 1000 });
    }
  }

  return { changes, invalid };
}

export default function ERPInventoryCountPage() {
  const [count, setCount] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeCountId, setActiveCountId] = useState('');
  const [draftValues, setDraftValues] = useState({});
  const [categoryFilter, setCategoryFilter] = useState('Todas');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadCount = useCallback(async (countId = '') => {
    setLoading(true);
    setError('');
    try {
      const url = countId ? `${API_PATH}?id=${encodeURIComponent(countId)}` : API_PATH;
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o balanço de estoque.');
      if (!Array.isArray(data.history) || (data.count && !Array.isArray(data.count.items))) {
        throw new Error('A resposta do balanço de estoque está inválida.');
      }
      setCount(data.count || null);
      setHistory(data.history);
      setActiveCountId(data.activeCountId || '');
      setDraftValues(Object.fromEntries((data.count?.items || []).map((item) => [
        item.id,
        item.countedQuantity === null ? '' : String(item.countedQuantity),
      ])));
      setFeedback('');
      return true;
    } catch (loadError) {
      console.error('Não foi possível carregar o balanço de estoque:', loadError);
      setError(loadError.message || 'Não foi possível carregar o balanço de estoque.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCount(); }, [loadCount]);

  const countChanges = useMemo(
    () => buildCountChanges(count, draftValues),
    [count, draftValues],
  );

  const stats = useMemo(() => {
    const byCategory = Object.fromEntries(INVENTORY_COUNT_CATEGORIES.map((category) => [
      category,
      { total: 0, counted: 0, differences: 0 },
    ]));
    let counted = 0;
    let differences = 0;

    for (const item of count?.items || []) {
      const categoryStats = byCategory[item.category] || byCategory['Outras categorias'];
      categoryStats.total += 1;
      const physicalMilliUnits = quantityToMilliUnits(draftValueFor(item, draftValues));
      if (physicalMilliUnits === null) continue;

      counted += 1;
      categoryStats.counted += 1;
      if (physicalMilliUnits !== Math.round(item.systemQuantity * 1000)) {
        differences += 1;
        categoryStats.differences += 1;
      }
    }

    const total = count?.items?.length || 0;
    return { byCategory, total, counted, pending: total - counted, differences };
  }, [count, draftValues]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeInventoryCountLabel(query);
    return (count?.items || [])
      .filter((item) => categoryFilter === 'Todas' || item.category === categoryFilter)
      .filter((item) => !normalizedQuery || [
        item.productTitle,
        item.productSku,
        item.productBarcode,
        item.productId,
        item.sourceCategory,
      ].some((value) => normalizeInventoryCountLabel(value).includes(normalizedQuery)))
      .sort((first, second) => first.productTitle.localeCompare(second.productTitle, 'pt-BR'));
  }, [count, categoryFilter, query]);

  const isEditable = count?.status === 'OPEN';
  const hasUnsavedChanges = countChanges.changes.length > 0;
  const progressPercent = stats.total ? Math.round((stats.counted / stats.total) * 100) : 0;

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  async function startCount() {
    setStarting(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(API_PATH, { method: 'POST' });
      const data = await response.json();
      if (!response.ok && data.code === 'ACTIVE_COUNT_EXISTS') {
        const loaded = await loadCount();
        if (loaded) setFeedback(data.error || 'Já existe um balanço em andamento e ele foi carregado.');
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível iniciar o balanço.');
      setCategoryFilter('Todas');
      setQuery('');
      const loaded = await loadCount(data.countId);
      if (loaded) setFeedback('Balanço iniciado. O saldo online foi registrado como referência.');
    } catch (startError) {
      console.error('Não foi possível iniciar o balanço de estoque:', startError);
      setError(startError.message || 'Não foi possível iniciar o balanço.');
    } finally {
      setStarting(false);
    }
  }

  async function saveCount() {
    if (!count || !countChanges.changes.length || countChanges.invalid) return;
    setSaving(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(API_PATH, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          countId: count.id,
          items: countChanges.changes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a contagem física.');
      const loaded = await loadCount(count.id);
      if (loaded) setFeedback('Contagem salva no ERP e compartilhada com os demais usuários.');
    } catch (saveError) {
      console.error('Não foi possível salvar a contagem física:', saveError);
      setError(saveError.message || 'Não foi possível salvar a contagem física.');
    } finally {
      setSaving(false);
    }
  }

  async function completeCount() {
    if (!count || !isEditable || hasUnsavedChanges || countChanges.invalid || stats.pending > 0) return;
    if (!window.confirm('Concluir este balanço? Ele ficará disponível para consulta e não alterará o estoque do sistema.')) return;

    setCompleting(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(API_PATH, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', countId: count.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir o balanço.');
      const loaded = await loadCount(count.id);
      if (loaded) setFeedback('Balanço concluído. O estoque online não foi alterado.');
    } catch (completeError) {
      console.error('Não foi possível concluir o balanço de estoque:', completeError);
      setError(completeError.message || 'Não foi possível concluir o balanço.');
    } finally {
      setCompleting(false);
    }
  }

  function selectHistory(event) {
    const countId = event.target.value;
    setCategoryFilter('Todas');
    setQuery('');
    loadCount(countId);
  }

  return <div className={`erp-page ${styles.page}`}>
    <header className="erp-customer-header">
      <div>
        <span className="eyebrow">Estoque operacional</span>
        <h1>Balanço de estoque</h1>
        <p>Compare o saldo online com a contagem física, organizado por categoria.</p>
      </div>
      <div className={styles.headerActions}>
        {history.length > 1 && <label className={styles.historySelect}>
          <span>Consultar balanço</span>
          <select value={count?.id || ''} onChange={selectHistory} disabled={loading || saving || hasUnsavedChanges}>
            {history.map((item) => <option key={item.id} value={item.id}>
              {item.status === 'OPEN' ? 'Em andamento' : 'Concluído'} · {formatCountDate(item.createdAt)}
            </option>)}
          </select>
        </label>}
        {activeCountId && count?.id !== activeCountId && <button type="button" className={styles.secondaryButton} onClick={() => loadCount(activeCountId)} disabled={loading || hasUnsavedChanges}>
          <ClipboardList size={16} /> Retomar balanço em andamento
        </button>}
        {count && isEditable && <button type="button" className={styles.secondaryButton} onClick={() => loadCount(count.id)} disabled={loading || saving || hasUnsavedChanges}>
          <RefreshCw size={16} /> Atualizar
        </button>}
        {count && isEditable && <button type="button" className={`primary-cta ${styles.actionButton}`} onClick={saveCount} disabled={saving || !hasUnsavedChanges || countChanges.invalid}>
          <Save size={16} /> {saving ? 'Salvando...' : `Salvar contagem${hasUnsavedChanges ? ` (${countChanges.changes.length})` : ''}`}
        </button>}
        {count && isEditable && <button type="button" className={styles.completeButton} onClick={completeCount} disabled={completing || saving || hasUnsavedChanges || countChanges.invalid || stats.pending > 0}>
          <CheckCircle2 size={16} /> {completing ? 'Concluindo...' : 'Concluir balanço'}
        </button>}
        {count?.status === 'COMPLETED' && !activeCountId && <button type="button" className={`primary-cta ${styles.actionButton}`} onClick={startCount} disabled={starting || loading}>
          <Plus size={16} /> {starting ? 'Iniciando...' : 'Iniciar novo balanço'}
        </button>}
      </div>
    </header>

    <div className={styles.notice}>
      <AlertCircle size={18} aria-hidden="true" />
      <p>O saldo online é fotografado quando o balanço começa. As contagens e diferenças ficam salvas e compartilhadas no ERP, mas <strong>não alteram o estoque oficial</strong>. Produtos fora das categorias listadas e itens de Hortifruti sem classificação reconhecível aparecem em “Outras categorias”.</p>
    </div>

    {error && <div className={styles.messageError} role="alert"><AlertCircle size={17} /> {error}</div>}
    {feedback && <div className={styles.messageSuccess} role="status"><CheckCircle2 size={17} /> {feedback}</div>}
    {countChanges.invalid && <div className={styles.messageError} role="alert">Use quantidades iguais ou maiores que zero, com até três casas decimais.</div>}
    {hasUnsavedChanges && !countChanges.invalid && <p className={styles.pendingChanges} role="status">Há {countChanges.changes.length.toLocaleString('pt-BR')} alteração(ões) sem salvar. Salve para compartilhar com os demais usuários.</p>}

    {loading && <section className="erp-table-panel"><div className="erp-empty-data">Carregando balanços salvos...</div></section>}

    {!loading && !error && !count && <section className={`erp-table-panel ${styles.emptyState}`}>
      <span className={styles.emptyIcon}><ClipboardList size={25} /></span>
      <h2>Nenhum balanço iniciado</h2>
      <p>Inicie um balanço para registrar a quantidade online de referência e começar a lançar a contagem física por categoria.</p>
      <button type="button" className={`primary-cta ${styles.actionButton}`} onClick={startCount} disabled={starting}>
        <Plus size={16} /> {starting ? 'Iniciando...' : 'Iniciar balanço'}
      </button>
    </section>}

    {!loading && count && <>
      <section className={styles.summaryPanel} aria-label="Resumo do balanço">
        <div className={styles.summaryHeader}>
          <div>
            <span className={isEditable ? styles.openStatus : styles.completedStatus}>{isEditable ? 'Em andamento' : 'Concluído'}</span>
            <h2>{isEditable ? 'Contagem em andamento' : 'Balanço concluído'}</h2>
            <p>Iniciado em {formatCountDate(count.createdAt)} por {count.createdBy}{count.completedAt ? ` · concluído em ${formatCountDate(count.completedAt)} por ${count.completedBy}` : ''}</p>
          </div>
          {isEditable && <div className={styles.progressSummary}>
            <strong>{stats.counted.toLocaleString('pt-BR')} de {stats.total.toLocaleString('pt-BR')} produtos contados</strong>
            <span>{progressPercent}% concluído</span>
            <div><i style={{ width: `${progressPercent}%` }} /></div>
          </div>}
        </div>
        <div className={styles.metrics}>
          <div><span>Produtos</span><strong>{stats.total.toLocaleString('pt-BR')}</strong></div>
          <div><span>Contados</span><strong>{stats.counted.toLocaleString('pt-BR')}</strong></div>
          <div><span>Pendentes</span><strong>{stats.pending.toLocaleString('pt-BR')}</strong></div>
          <div><span>Com diferença</span><strong>{stats.differences.toLocaleString('pt-BR')}</strong></div>
        </div>
      </section>

      <section className={`erp-table-panel ${styles.countPanel}`} aria-label="Contagem por categoria">
        <div className="erp-table-heading">
          <div><h3>Categorias</h3><p>Selecione uma categoria para filtrar os produtos do balanço.</p></div>
          <label className={`erp-search ${styles.search}`}>
            <Search size={15} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU ou código" aria-label="Buscar produto, SKU ou código de barras" />
          </label>
        </div>

        <div className={styles.categoryGrid}>
          <button type="button" className={styles.categoryButton} aria-pressed={categoryFilter === 'Todas'} onClick={() => setCategoryFilter('Todas')}>
            <span>Todas</span><strong>{stats.total.toLocaleString('pt-BR')}</strong><small>{stats.differences.toLocaleString('pt-BR')} com diferença</small>
          </button>
          {INVENTORY_COUNT_CATEGORIES.map((category) => {
            const categoryStats = stats.byCategory[category];
            return <button type="button" key={category} className={styles.categoryButton} aria-pressed={categoryFilter === category} onClick={() => setCategoryFilter(category)}>
              <span>{category}</span><strong>{categoryStats.total.toLocaleString('pt-BR')}</strong><small>{categoryStats.counted.toLocaleString('pt-BR')} contados · {categoryStats.differences.toLocaleString('pt-BR')} divergências</small>
            </button>;
          })}
        </div>

        <div className={styles.tableToolbar}>
          <div><h3>{categoryFilter === 'Todas' ? 'Todos os produtos' : categoryFilter}</h3><p>{filteredItems.length.toLocaleString('pt-BR')} produto(s) exibido(s)</p></div>
          {isEditable && <span className={styles.tableHelp}>{stats.pending > 0 ? `Informe 0 quando não houver quantidade física.` : 'Todos os produtos foram contados.'}</span>}
        </div>

        {!filteredItems.length ? <div className="erp-empty-data">Nenhum produto corresponde a esta categoria ou busca.</div> : <div className={`erp-table-scroll ${styles.tableScroll}`}>
          <table className={`erp-table ${styles.table}`}>
            <thead><tr><th>Produto / SKU</th><th>Categoria</th><th>Saldo online inicial</th><th>Contagem física</th><th>Diferença</th></tr></thead>
            <tbody>{filteredItems.map((item) => {
              const value = draftValueFor(item, draftValues);
              const physicalMilliUnits = quantityToMilliUnits(value);
              const difference = physicalMilliUnits === null
                ? null
                : (physicalMilliUnits - Math.round(item.systemQuantity * 1000)) / 1000;
              return <tr key={item.id}>
                <td><div className={styles.productIdentity}><strong>{item.productTitle}</strong><small>{item.productSku || item.productId}{item.productStatus !== 'Ativo' ? ` · ${item.productStatus}` : ''}</small></div></td>
                <td><span className={styles.categoryTag}>{item.category}</span>{item.category === 'Outras categorias' && <small className={styles.sourceCategory}>{item.sourceCategory}</small>}</td>
                <td><strong>{formatQuantity(item.systemQuantity)}</strong> <small>{item.unit}</small></td>
                <td><label className={styles.quantityField}>
                  <input
                    type="number"
                    min="0"
                    max="999999999.999"
                    step="0.001"
                    value={value}
                    onChange={(event) => setDraftValues((current) => ({ ...current, [item.id]: event.target.value }))}
                    disabled={!isEditable || saving}
                    aria-label={`Contagem física de ${item.productTitle}`}
                  />
                  <span>{item.unit}</span>
                </label></td>
                <td>{difference === null ? <span className={styles.unCounted}>—</span> : <strong className={difference > 0 ? styles.positiveDifference : difference < 0 ? styles.negativeDifference : styles.equalDifference}>{formatDifference(difference)}</strong>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>}

        {isEditable && stats.pending > 0 && <p className={styles.completionHint}>Para concluir, conte todos os produtos. Informe zero nos itens sem estoque físico.</p>}
      </section>
    </>}
  </div>;
}
