'use client';

import { ArrowLeft, Check, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAuditValue } from '../api/product-audit.js';
import { calculateProductPricing, formatBRL, parseBRL, parsePercent, priceFromMarkup, roundMoney } from './product-pricing.js';
import { encodeProductImage } from './product-image.js';

const categories = ['Hortifruti', 'Açougue', 'Padaria', 'Mercearia', 'Bebidas', 'Vinhos', 'Bebidas Alcoólicas', 'Cervejas', 'Produtos de Limpeza', 'Lavanderia', 'Pet Shop', 'Higiene Pessoal', 'Bomboniere', 'Laticínios', 'Bebês'];
const emptyProduct = { title: '', description: '', price: '', cost: '', promotionalPrice: '', discount: '', profitMarginPercent: '', profitMarginValue: '', markupPercent: '', suggestedMarkup: '', priceType: 'Normal', featuredPriceTypes: [], barcodes: [], barcode: '', sku: '', expiry: '', lot: '', manufactureDate: '', controlsLot: false, controlsExpiry: false, minimumShelfLife: '', serialNumber: '', quantity: '0', minStock: '0', maxStock: '', location: '', weight: '', height: '', width: '', length: '', packageWeight: '', packageType: '', transportUnit: '', fragile: false, refrigerated: false, frozen: false, roomTemperature: true, specialCare: false, saleUnit: 'Unidade', fractionalSale: false, brand: '', manufacturer: '', supplier: '', suppliers: [], categories: [], department: '', subcategory: '', tags: [], collection: '', productType: '', perishable: false, seasonal: false, exclusive: false, promotionStart: '', promotionEnd: '', promotionLimit: '', promotionStock: '', promotionType: '', image: '', status: 'Ativo' };
const markupSuggestions = { 'Mercearia': '20% a 35%', 'Cervejas': '15% a 25%', 'Bebidas': '30% a 45%', 'Laticínios': '25% a 40%', 'Bebidas Alcoólicas': '40% a 60%', 'Vinhos': '50% a 80%', 'Bomboniere': '45% a 65%', 'Açougue': '35% a 55%', 'Hortifruti': '55% a 80%', 'Padaria': '100% a 150%', 'Produtos de Limpeza': '35% a 45%', 'Lavanderia': '25% a 35%', 'Higiene Pessoal': '35% a 50%', 'Bebês': '15% a 30%', 'Pet Shop': '35% a 55%' };
const markupStrategy = { 'Mercearia': 'Giro alto e preço competitivo.', 'Cervejas': 'Produto isca e volume.', 'Bebidas': 'Giro alto e custo de refrigeração.', 'Laticínios': 'Giro rápido e validade rigorosa.', 'Bebidas Alcoólicas': 'Menor giro e maior valor agregado.', 'Vinhos': 'Experiência de compra e maior valor.', 'Bomboniere': 'Compra por impulso.', 'Açougue': 'Cobre operação, energia e quebra.', 'Hortifruti': 'Protege contra desperdício.', 'Padaria': 'Cobre transformação e mão de obra.', 'Produtos de Limpeza': 'Giro médio e concorrência moderada.', 'Lavanderia': 'Marcas fortes e alta comparação.', 'Higiene Pessoal': 'Concorrência e giro médios.', 'Bebês': 'Produto ímã, margem competitiva.', 'Pet Shop': 'Ração gira; acessórios têm maior margem.' };
const isKilogramSaleUnit = (value) => /^(kg|quilo|quilograma)s?$/i.test(String(value || '').trim());
const auditFieldLabels = { title: 'Nome', description: 'Descrição', price: 'Preço', cost: 'Custo', discount: 'Desconto', quantity: 'Estoque', sku: 'SKU', barcode: 'Código de barras', barcodes: 'Códigos de barras', brand: 'Marca', manufacturer: 'Fabricante', supplier: 'Fornecedor', suppliers: 'Fornecedores', subcategory: 'Categoria', categories: 'Categorias', image: 'Imagem', status: 'Status', expiry: 'Validade', saleUnit: 'Unidade de venda', priceHistory: 'Histórico de preços', createdAt: 'Criado em', createdBy: 'Criado por', updatedAt: 'Atualizado em', updatedBy: 'Atualizado por' };
const auditActionLabels = { CREATE: 'Produto cadastrado', UPDATE: 'Produto atualizado', DELETE: 'Produto excluído', LEGACY_BASELINE: 'Snapshot inicial legado', LEGACY_PRICE_HISTORY: 'Registro legado de preço' };
const formatAuditDate = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));

export default function ERPProductsPage() {
  const [editId, setEditId] = useState('');
  const [product, setProduct] = useState(emptyProduct);
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState('Geral');
  const [newBarcode, setNewBarcode] = useState('');
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditRefresh, setAuditRefresh] = useState(0);
  const isEditing = Boolean(editId);
  const update = (key, value) => setProduct((current) => {
    const next = { ...current, [key]: value };
    const cost = parseBRL(key === 'cost' ? value : current.cost);
    const price = parseBRL(key === 'price' ? value : current.price);

    if (key === 'markupPercent') {
      if (cost > 0 && String(value).trim() !== '') next.price = formatBRL(priceFromMarkup(cost, value));
    } else if (key === 'cost' || key === 'price') {
      next.markupPercent = cost > 0 ? (((price - cost) / cost) * 100).toFixed(2) : '';
    }

    return next;
  });
  const toggleCategory = (category) => update('categories', product.categories.includes(category) ? product.categories.filter((item) => item !== category) : [...product.categories, category]);
  const togglePriceType = (type) => update('featuredPriceTypes', product.featuredPriceTypes.includes(type) ? product.featuredPriceTypes.filter((item) => item !== type) : [...product.featuredPriceTypes, type]);
  const addListValue = (key, value, clear) => { const normalized = String(value || '').trim(); if (!normalized) return; update(key, [...new Set([...(product[key] || []), normalized])]); clear(''); };
  const removeListValue = (key, value) => update(key, (product[key] || []).filter((item) => item !== value));
  const updatePromotionalPrice = (value) => {
    update('promotionalPrice', value);
  };
  const readImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedback('A imagem original precisa ter no máximo 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setFeedback('Não foi possível ler a imagem selecionada.');
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setFeedback('O arquivo selecionado não é uma imagem válida.');
      image.onload = () => {
        const scale = Math.min(1, 1024 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
          setFeedback('Não foi possível preparar esta imagem.');
          return;
        }
        try {
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const compressedImage = encodeProductImage(canvas, context);
          update('image', compressedImage);
          setFeedback(compressedImage.startsWith('data:image/png')
            ? 'Imagem carregada em PNG com transparência preservada. Salve o produto para publicar a alteração.'
            : 'Imagem carregada. Salve o produto para publicar a alteração.');
        } catch (error) {
          setFeedback(error.message || 'Não foi possível preparar esta imagem.');
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    setEditId(new URLSearchParams(window.location.search).get('edit') || '');
  }, []);
  useEffect(() => {
    if (!editId) return;
    fetch('/api/products', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o produto.');
        return data;
      })
      .then(({ products = [] }) => {
        const savedProduct = products.find((item) => item.id === editId);
        if (!savedProduct) return setFeedback('Produto não encontrado.');
        const savedCost = Number(savedProduct.cost) || 0;
        const savedPrice = Number(savedProduct.price) || 0;
        const savedMarkup = savedProduct.markupPercent ?? (savedCost ? ((savedPrice - savedCost) / savedCost) * 100 : '');
        const saleUnit = isKilogramSaleUnit(savedProduct.saleUnit) ? 'Quilograma' : 'Unidade';
        setProduct({ ...emptyProduct, ...savedProduct, saleUnit, fractionalSale: saleUnit === 'Quilograma', price: formatBRL(savedPrice), cost: formatBRL(savedCost), promotionalPrice: savedProduct.promotionalPrice ? formatBRL(savedProduct.promotionalPrice) : '', markupPercent: savedMarkup === '' ? '' : Number(savedMarkup).toFixed(2), discount: String(savedProduct.discount ?? 0), quantity: String(savedProduct.quantity ?? 0), categories: savedProduct.categories || [], barcodes: savedProduct.barcodes || (savedProduct.barcode ? [savedProduct.barcode] : []), featuredPriceTypes: savedProduct.featuredPriceTypes || [], tags: savedProduct.tags || [], suppliers: savedProduct.suppliers || [] });
      })
      .catch(() => setFeedback('Não foi possível carregar o produto.'));
  }, [editId]);
  useEffect(() => {
    if (!editId) return;
    let active = true;
    setAuditLoading(true);
    setAuditError('');
    fetch(`/api/products/audit?productId=${encodeURIComponent(editId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a auditoria.');
        if (active) setAuditEntries(data.entries || []);
      })
      .catch((error) => {
        if (active) setAuditError(error.message || 'Não foi possível carregar a auditoria.');
      })
      .finally(() => {
        if (active) setAuditLoading(false);
      });
    return () => { active = false; };
  }, [editId, auditRefresh]);
  useEffect(() => {
    const pricing = calculateProductPricing(product);
    setProduct((current) => ({
      ...current,
      effectivePrice: formatBRL(pricing.effectivePrice),
      profitMarginPercent: pricing.profitMarginPercent.toFixed(2),
      profitMarginValue: formatBRL(pricing.profitValue),
      markupPercent: String(current.markupPercent || '').trim() === '' ? '' : pricing.markupPercent.toFixed(2),
    }));
  }, [product.cost, product.price, product.promotionalPrice, product.discount]);
  useEffect(() => {
    const selectedCategory = product.categories.find((category) => markupSuggestions[category]);
    if (selectedCategory) update('suggestedMarkup', markupSuggestions[selectedCategory]);
  }, [product.categories]);
  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFeedback('');
    const cost = parseBRL(product.cost);
    const markupPercent = parsePercent(product.markupPercent);
    const discount = Math.min(100, Math.max(0, parsePercent(product.discount)));
    const price = parseBRL(product.price);
    const promotionalPrice = parseBRL(product.promotionalPrice);
    const discountedPrice = roundMoney(price * (1 - discount / 100));
    const effectivePrice = promotionalPrice > 0 ? promotionalPrice : discountedPrice;
    const profitMarginValue = roundMoney(effectivePrice - cost);
    try {
      const response = await fetch('/api/products', { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...product, fractionalSale: product.saleUnit === 'Quilograma', price, cost, promotionalPrice, profitMarginPercent: effectivePrice > 0 ? Number(((profitMarginValue / effectivePrice) * 100).toFixed(2)) : 0, profitMarginValue, markupPercent, barcodes: [...new Set([...(product.barcodes || []), product.barcode].filter(Boolean))], barcode: product.barcodes?.[0] || product.barcode || '', discount, quantity: Number(product.quantity || 0) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o produto.');
      if (isEditing) {
        setProduct((current) => ({ ...current, ...data.product, price: formatBRL(data.product.price), cost: formatBRL(data.product.cost), promotionalPrice: formatBRL(data.product.promotionalPrice ?? data.product.price) }));
        setAuditRefresh((current) => current + 1);
      } else {
        setProduct(emptyProduct);
      }
      setFeedback(isEditing ? 'Produto atualizado com sucesso.' : 'Produto salvo e publicado nas categorias selecionadas.');
    } catch (error) {
      setFeedback(error.message || 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  };

  const tabs = ['Geral', 'Preço', 'Estoque', 'Logística', 'Loja', 'SEO'];
  const priceTypes = ['Promoção', 'Oferta', 'Clube Hoje', 'Super Hoje'];
  const calculatedFields = ['profitMarginPercent', 'profitMarginValue'];
  const field = (label, key, type = 'text') => <label>{label}<input type={type === 'currency' ? 'text' : type} inputMode={type === 'currency' ? 'decimal' : undefined} value={product[key] ?? ''} readOnly={calculatedFields.includes(key)} onChange={(event) => key === 'promotionalPrice' ? updatePromotionalPrice(event.target.value) : update(key, event.target.value)} onBlur={type === 'currency' ? () => update(key, formatBRL(parseBRL(product[key]))) : undefined} /></label>;
  const selectedSuggestionCategory = product.categories.find((category) => markupSuggestions[category]);
  return <form className="shopify-product-page" onSubmit={saveProduct}>
    <header className="product-editor-header"><div className="product-editor-heading"><a href="/erp/products" className="back-link"><ArrowLeft size={17} /></a><div><span className="eyebrow">Cadastro de produto</span><h1>{isEditing ? 'Alterar cadastro' : 'Cadastrar produto'}</h1></div></div><button className="primary-cta" disabled={saving}><Save size={15} /> {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar produto'}</button></header>
    <div className="product-editor-tabs">{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    <div className="product-editor-layout"><main className="product-editor-main">
      {activeTab === 'Geral' && <><section className="editor-card"><h2>Informações do produto</h2>{field('Nome do produto', 'title')}<label>Descrição<textarea value={product.description} onChange={(event) => update('description', event.target.value)} rows="4" /></label><div className="editor-form-grid three">{field('SKU', 'sku')}{field('Marca', 'brand')}{field('Fabricante', 'manufacturer')}</div></section><section className="editor-card"><h2>Códigos de barras</h2><div className="editor-inline"><input value={newBarcode} onChange={(event) => setNewBarcode(event.target.value)} placeholder="EAN, GTIN ou código interno" /><button type="button" className="editor-link" onClick={() => addListValue('barcodes', newBarcode, setNewBarcode)}><Plus size={15} /> Adicionar</button></div><div className="editor-chip-list">{product.barcodes.map((code) => <span key={code}>{code}<button type="button" onClick={() => removeListValue('barcodes', code)} aria-label={`Remover código ${code}`}><Trash2 size={13} /></button></span>)}</div></section><section className="editor-card"><h2>Organização</h2><div className="editor-form-grid three">{field('Departamento', 'department')}{field('Categoria', 'subcategory')}{field('Coleção', 'collection')}{field('Tipo de produto', 'productType')}{field('Fornecedor principal', 'supplier')}{field('Status', 'status')}</div><p className="editor-hint">Categorias principais</p><div className="category-checklist">{categories.map((category) => <label key={category}><input type="checkbox" checked={product.categories.includes(category)} onChange={() => toggleCategory(category)} /> {category}</label>)}</div></section></>}
      {activeTab === 'Preço' && <><section className="editor-card"><h2>Preços e markup</h2><div className="editor-form-grid three">{field(product.saleUnit === 'Quilograma' ? 'Custo por kg' : 'Custo de compra', 'cost', 'currency')}{field(product.saleUnit === 'Quilograma' ? 'Preço de venda por kg' : 'Preço de venda', 'price', 'currency')}{field(product.saleUnit === 'Quilograma' ? 'Preço promocional por kg' : 'Preço promocional', 'promotionalPrice', 'currency')}{field('Desconto (%)', 'discount', 'number')}{field('Margem de lucro (%)', 'profitMarginPercent', 'number')}{field('Margem de lucro (R$)', 'profitMarginValue', 'currency')}{field('Markup (%)', 'markupPercent', 'number')}</div><div className="effective-price-note">Preço efetivo considerado: <strong>{product.effectivePrice || 'informe os preços'}</strong><small>Usa o preço promocional quando informado; caso contrário, usa o preço de venda.</small></div><p className="editor-hint">O markup calcula automaticamente: custo de compra × (1 + markup ÷ 100) = preço de venda. Promoção e desconto atualizam a margem com base no preço efetivo.</p><div className="markup-suggestion"><strong>Sugestão para {selectedSuggestionCategory || 'a categoria selecionada'}</strong><span>Markup sugerido: {product.suggestedMarkup || 'selecione uma categoria'}</span><small>{markupStrategy[selectedSuggestionCategory] || 'Escolha uma categoria para receber uma referência de precificação.'}</small></div><label>Tipo de preço<select value={product.priceType} onChange={(event) => update('priceType', event.target.value)}><option>Normal</option>{priceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><p className="editor-hint">Tipos de vitrine</p><div className="price-type-bubbles">{priceTypes.map((type) => <button type="button" key={type} className={product.featuredPriceTypes.includes(type) ? 'active' : ''} onClick={() => togglePriceType(type)}>{type}</button>)}</div></section><section className="editor-card"><h2>Promoção</h2><div className="editor-form-grid three">{field('Data inicial', 'promotionStart', 'date')}{field('Data final', 'promotionEnd', 'date')}{field('Limite por cliente', 'promotionLimit', 'number')}{field('Estoque promocional', 'promotionStock', 'number')}{field('Tipo de promoção', 'promotionType')}</div></section></>}
      {activeTab === 'Estoque' && <><section className="editor-card"><h2>Estoque e rastreabilidade</h2><div className="editor-form-grid three">{field(product.saleUnit === 'Quilograma' ? 'Quantidade em estoque (kg)' : 'Quantidade', 'quantity', 'number')}{field(product.saleUnit === 'Quilograma' ? 'Estoque mínimo (kg)' : 'Estoque mínimo', 'minStock', 'number')}{field(product.saleUnit === 'Quilograma' ? 'Estoque máximo (kg)' : 'Estoque máximo', 'maxStock', 'number')}{field('Localização', 'location')}{field('Lote', 'lot')}{field('Número de série', 'serialNumber')}{field('Data de fabricação', 'manufactureDate', 'date')}{field('Data de validade', 'expiry', 'date')}{field('Validade mínima para venda', 'minimumShelfLife')}</div><div className="editor-toggle-grid"><label><input type="checkbox" checked={product.controlsLot} onChange={(event) => update('controlsLot', event.target.checked)} /> Controla lote</label><label><input type="checkbox" checked={product.controlsExpiry} onChange={(event) => update('controlsExpiry', event.target.checked)} /> Controla validade</label><label><input type="checkbox" checked={product.perishable} onChange={(event) => update('perishable', event.target.checked)} /> Perecível</label></div></section></>}
      {activeTab === 'Logística' && <section className="editor-card"><h2>Logística e conservação</h2><div className="editor-form-grid three">{field('Peso', 'weight')}{field('Altura', 'height')}{field('Largura', 'width')}{field('Comprimento', 'length')}{field('Peso da embalagem', 'packageWeight')}{field('Tipo de embalagem', 'packageType')}{field('Unidade de transporte', 'transportUnit')}<label>Forma de venda<select value={product.saleUnit} onChange={(event) => update('saleUnit', event.target.value)}><option value="Unidade">Unidade</option><option value="Quilograma">Quilograma (preço por kg)</option></select></label></div>{product.saleUnit === 'Quilograma' && <p className="editor-hint">Na loja, o primeiro clique adiciona 100 g. Cada + ou − altera o peso em 100 g; informe preço e estoque por kg.</p>}<div className="editor-toggle-grid"><label><input type="checkbox" checked={product.fragile} onChange={(event) => update('fragile', event.target.checked)} /> Frágil</label><label><input type="checkbox" checked={product.refrigerated} onChange={(event) => update('refrigerated', event.target.checked)} /> Refrigerado</label><label><input type="checkbox" checked={product.frozen} onChange={(event) => update('frozen', event.target.checked)} /> Congelado</label><label><input type="checkbox" checked={product.roomTemperature} onChange={(event) => update('roomTemperature', event.target.checked)} /> Temperatura ambiente</label><label><input type="checkbox" checked={product.specialCare} onChange={(event) => update('specialCare', event.target.checked)} /> Cuidado especial</label></div></section>}
      {activeTab === 'Loja' && <><section className="editor-card"><h2>Imagem da loja</h2><div className="media-dropzone"><ImagePlus size={28} /><strong>Selecione uma imagem</strong><span>A imagem será exibida na loja.</span><input type="file" accept="image/*" onChange={readImage} /></div>{product.image && <div className="media-preview-grid"><img src={product.image} alt="Prévia do produto" /></div>}</section><section className="editor-card"><h2>Tags e fornecedores</h2><div className="editor-inline"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Ex.: sem lactose" /><button type="button" className="editor-link" onClick={() => addListValue('tags', newTag, setNewTag)}><Plus size={15} /> Adicionar tag</button></div><div className="editor-chip-list">{product.tags.map((tag) => <span key={tag}>{tag}<button type="button" onClick={() => removeListValue('tags', tag)} aria-label={`Remover tag ${tag}`}><Trash2 size={13} /></button></span>)}</div><p className="editor-hint">Fornecedores alternativos e dados de compra podem ser adicionados depois no mesmo cadastro.</p></section></>}
      {activeTab === 'SEO' && <section className="editor-card"><h2>SEO e descoberta</h2>{field('Título SEO', 'seoTitle')}{field('URL amigável', 'seoSlug')}<label>Meta descrição<textarea value={product.metaDescription || ''} onChange={(event) => update('metaDescription', event.target.value)} rows="4" /></label>{field('Palavras-chave', 'seoKeywords')}</section>}
    </main><aside className="product-editor-side"><section className="editor-card"><h2>Resumo</h2><p className="editor-hint">Preencha as abas para manter preço, estoque, logística e vitrine consistentes.</p><span className="status-pill ok">{product.status}</span></section></aside></div>
    {isEditing && <section className="editor-card product-audit-history"><h2>Auditoria do produto</h2><p>Histórico persistente de cadastro e alterações, com responsável, data e valores registrados.</p>{auditLoading && <p>Carregando auditoria...</p>}{auditError && <p role="alert">{auditError}</p>}{!auditLoading && !auditError && auditEntries.length === 0 && <p>Nenhum registro de auditoria disponível para este produto.</p>}{auditEntries.map((entry) => { const fields = entry.changes && typeof entry.changes === 'object' ? Object.entries(entry.changes) : Object.entries(entry.snapshot || {}); return <details className="product-audit-entry" key={entry.id}><summary><strong>{auditActionLabels[entry.action] || entry.action}</strong><span>{formatAuditDate(entry.occurredAt)} · {entry.actor}</span></summary>{entry.note && <p>{entry.note}</p>}{fields.length > 0 && <dl>{fields.map(([key, value]) => <div key={key}><dt>{auditFieldLabels[key] || key}</dt>{entry.changes ? <dd>De: {formatAuditValue(value?.before)} <span aria-hidden="true">→</span> Para: {formatAuditValue(value?.after)}</dd> : <dd>{formatAuditValue(value)}</dd>}</div>)}</dl>}</details>; })}</section>}
    {feedback && <div className="editor-saved"><Check size={15} /> {feedback}</div>}
  </form>;
}
