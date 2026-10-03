'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ExternalLink, History, Package, Search } from 'lucide-react';
import { formatAuditValue, getAuditProductImage } from '../api/product-audit.js';

const actionLabels = {
  CREATE: 'Cadastro inicial',
  UPDATE: 'Edição',
  DELETE: 'Exclusão',
  PURCHASE_RECEIPT: 'Recebimento de compra',
  INVENTORY_LOT_CREATED: 'Cadastro de lote',
  INVENTORY_LOT_RECEIPT: 'Entrada em lote',
  INVENTORY_LOT_UPDATED: 'Ajuste de lote',
  ORDER_FULFILLMENT: 'Baixa por separação',
  LEGACY_BASELINE: 'Snapshot legado',
  LEGACY_PRICE_HISTORY: 'Registro legado de preço',
};

const fieldLabels = {
  title: 'Nome do produto',
  description: 'Descrição',
  price: 'Preço de venda',
  cost: 'Custo',
  discount: 'Desconto',
  quantity: 'Estoque',
  sku: 'SKU',
  barcode: 'Código de barras',
  barcodes: 'Códigos de barras',
  brand: 'Marca',
  manufacturer: 'Fabricante',
  supplier: 'Fornecedor',
  suppliers: 'Fornecedores',
  subcategory: 'Subcategoria',
  categories: 'Categorias',
  image: 'Imagem',
  status: 'Status',
  expiry: 'Validade',
  saleUnit: 'Unidade de venda',
  priceHistory: 'Histórico de preços',
  effectivePrice: 'Preço efetivo',
  promotionalPrice: 'Preço promocional',
  profitMarginPercent: 'Margem de lucro (%)',
  profitMarginValue: 'Margem de lucro (R$)',
  markupPercent: 'Markup (%)',
  suggestedMarkup: 'Markup sugerido',
  priceType: 'Tipo de preço',
  featuredPriceTypes: 'Destaques de preço',
  lot: 'Lote',
  manufactureDate: 'Data de fabricação',
  controlsLot: 'Controla lote',
  controlsExpiry: 'Controla validade',
  minimumShelfLife: 'Validade mínima para venda',
  serialNumber: 'Número de série',
  minStock: 'Estoque mínimo',
  maxStock: 'Estoque máximo',
  location: 'Localização',
  weight: 'Peso',
  height: 'Altura',
  width: 'Largura',
  length: 'Comprimento',
  packageWeight: 'Peso da embalagem',
  packageType: 'Tipo de embalagem',
  transportUnit: 'Unidade de transporte',
  fragile: 'Frágil',
  refrigerated: 'Refrigerado',
  frozen: 'Congelado',
  roomTemperature: 'Temperatura ambiente',
  specialCare: 'Cuidado especial',
  fractionalSale: 'Venda fracionada',
  department: 'Departamento',
  tags: 'Tags',
  collection: 'Coleção',
  productType: 'Tipo de produto',
  perishable: 'Perecível',
  seasonal: 'Sazonal',
  exclusive: 'Exclusivo',
  promotionStart: 'Início da promoção',
  promotionEnd: 'Fim da promoção',
  promotionLimit: 'Limite por cliente',
  promotionStock: 'Estoque promocional',
  promotionType: 'Tipo de promoção',
  seoTitle: 'Título SEO',
  seoSlug: 'URL amigável',
  metaDescription: 'Meta descrição',
  seoKeywords: 'Palavras-chave SEO',
  createdAt: 'Criado em',
  createdBy: 'Criado por',
  updatedAt: 'Atualizado em',
  updatedBy: 'Atualizado por',
};

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

function AuditFields({ entry }) {
  const changes = entry.changes && typeof entry.changes === 'object'
    ? Object.entries(entry.changes)
    : null;
  const snapshot = entry.snapshot && typeof entry.snapshot === 'object'
    ? Object.entries(entry.snapshot)
    : [];

  if (!changes && !snapshot.length) return <p>Este registro não possui um snapshot detalhado disponível.</p>;

  return <dl className="product-audit-fields">
    {(changes || snapshot).map(([key, value]) => <div key={key}>
      <dt>{fieldLabels[key] || key}</dt>
      {changes
        ? <dd><span>Antes: {formatAuditValue(value?.before)}</span><span>Depois: {formatAuditValue(value?.after)}</span></dd>
        : <dd>{formatAuditValue(value)}</dd>}
    </div>)}
  </dl>;
}

export default function ProductAuditPage() {
  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const loadEntries = useCallback(async ({ cursor = '', append = false } = {}) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: '50' });
    if (searchTerm) params.set('q', searchTerm);
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (cursor) params.set('cursor', cursor);

    try {
      const response = await fetch(`/api/products/audit?${params}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a auditoria.');
      setEntries((current) => append ? [...current, ...(data.entries || [])] : data.entries || []);
      setTotal(data.total || 0);
      setNextCursor(data.nextCursor || null);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar a auditoria.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchTerm, action, from, to]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries, refresh]);

  const search = (event) => {
    event.preventDefault();
    setSearchTerm(query.trim());
    setRefresh((value) => value + 1);
  };

  return <div className="product-audit-page">
    <header className="product-audit-header">
      <div><span className="eyebrow">Rastreabilidade do catálogo</span><h1>Auditoria de produtos</h1><p>Consulte quem cadastrou ou alterou cada produto, quando aconteceu e quais informações foram incluídas, modificadas ou removidas.</p></div>
      <div className="product-audit-total"><History size={18} /><strong>{total.toLocaleString('pt-BR')}</strong><span>registros</span></div>
    </header>

    <form className="product-audit-filters" onSubmit={search}>
      <label className="product-audit-search"><span>Produto, ID ou responsável</span><div><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, ID ou usuário" /></div></label>
      <label><span>Tipo de registro</span><select value={action} onChange={(event) => setAction(event.target.value)}><option value="">Todos</option><option value="CREATE">Cadastro inicial</option><option value="UPDATE">Edição</option><option value="DELETE">Exclusão</option><option value="LEGACY_BASELINE">Snapshot legado</option><option value="LEGACY_PRICE_HISTORY">Registro legado de preço</option></select></label>
      <label><span>De</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label><span>Até</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" className="primary-cta"><Search size={15} /> Buscar</button>
    </form>

    {error && <div className="product-audit-error" role="alert">{error}</div>}
    {loading && <div className="product-audit-empty">Carregando registros de auditoria...</div>}
    {!loading && !error && !entries.length && <div className="product-audit-empty">Nenhum registro encontrado para os filtros informados.</div>}

    {!loading && entries.length > 0 && <section className="product-audit-list" aria-label="Registros de auditoria">
      {entries.map((entry) => {
        const productId = entry.productExternalId || entry.productId;
        const productImage = getAuditProductImage(entry, entry.productImage);
        return <details className="product-audit-record" key={entry.id}>
          <summary>
            <span className={`product-audit-action ${entry.action === 'CREATE' ? 'create' : entry.action === 'UPDATE' ? 'update' : ''}`}>{actionLabels[entry.action] || entry.action}</span>
            <span className="product-audit-product"><span className="erp-product-thumbnail">{productImage ? <img src={productImage} alt="" loading="lazy" decoding="async" /> : <Package size={18} aria-hidden="true" />}</span><span><strong>{entry.productTitle}</strong><small>{productId}</small></span></span>
            <span className="product-audit-actor">{entry.actor}</span>
            <time dateTime={entry.occurredAt}>{dateTime.format(new Date(entry.occurredAt))} BRT</time>
            <ChevronDown className="product-audit-chevron" size={17} />
          </summary>
          <div className="product-audit-record-body">
            <div className="product-audit-record-meta"><span><strong>Responsável:</strong> {entry.actor}</span><span><strong>Data e hora:</strong> {dateTime.format(new Date(entry.occurredAt))} (BRT)</span>{entry.note && <p>{entry.note}</p>}</div>
            <AuditFields entry={entry} />
            {entry.action !== 'DELETE' && <Link className="product-audit-edit-link" href={`/erp/catalog?edit=${encodeURIComponent(productId)}`}>Abrir produto para editar <ExternalLink size={14} /></Link>}
          </div>
        </details>;
      })}
    </section>}

    {!loading && nextCursor && <button type="button" className="product-audit-load-more" disabled={loadingMore} onClick={() => loadEntries({ cursor: nextCursor, append: true })}>{loadingMore ? 'Carregando...' : 'Carregar mais registros'}</button>}
  </div>;
}
