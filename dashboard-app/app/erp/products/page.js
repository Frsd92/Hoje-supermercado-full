'use client';

import { ArrowLeft, Check, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const categories = ['Hortifruti', 'Açougue', 'Padaria', 'Mercearia', 'Bebidas', 'Vinhos', 'Bebidas Alcoólicas', 'Cervejas', 'Produtos de Limpeza', 'Lavanderia', 'Pet Shop', 'Higiene Pessoal', 'Bomboniere', 'Laticínios', 'Bebês'];
const emptyProduct = { title: '', description: '', price: '', cost: '', promotionalPrice: '', discount: '', profitMarginPercent: '', profitMarginValue: '', markupPercent: '', suggestedMarkup: '', priceType: 'Normal', featuredPriceTypes: [], barcodes: [], barcode: '', sku: '', expiry: '', lot: '', manufactureDate: '', controlsLot: false, controlsExpiry: false, minimumShelfLife: '', serialNumber: '', quantity: '0', minStock: '0', maxStock: '', location: '', weight: '', height: '', width: '', length: '', packageWeight: '', packageType: '', transportUnit: '', fragile: false, refrigerated: false, frozen: false, roomTemperature: true, specialCare: false, saleUnit: 'Unidade', fractionalSale: false, brand: '', manufacturer: '', supplier: '', suppliers: [], categories: [], department: '', subcategory: '', tags: [], collection: '', productType: '', perishable: false, seasonal: false, exclusive: false, promotionStart: '', promotionEnd: '', promotionLimit: '', promotionStock: '', promotionType: '', image: '', status: 'Ativo' };
const markupSuggestions = { 'Mercearia': '20% a 35%', 'Cervejas': '15% a 25%', 'Bebidas': '30% a 45%', 'Laticínios': '25% a 40%', 'Bebidas Alcoólicas': '40% a 60%', 'Vinhos': '50% a 80%', 'Bomboniere': '45% a 65%', 'Açougue': '35% a 55%', 'Hortifruti': '55% a 80%', 'Padaria': '100% a 150%', 'Produtos de Limpeza': '35% a 45%', 'Lavanderia': '25% a 35%', 'Higiene Pessoal': '35% a 50%', 'Bebês': '15% a 30%', 'Pet Shop': '35% a 55%' };
const markupStrategy = { 'Mercearia': 'Giro alto e preço competitivo.', 'Cervejas': 'Produto isca e volume.', 'Bebidas': 'Giro alto e custo de refrigeração.', 'Laticínios': 'Giro rápido e validade rigorosa.', 'Bebidas Alcoólicas': 'Menor giro e maior valor agregado.', 'Vinhos': 'Experiência de compra e maior valor.', 'Bomboniere': 'Compra por impulso.', 'Açougue': 'Cobre operação, energia e quebra.', 'Hortifruti': 'Protege contra desperdício.', 'Padaria': 'Cobre transformação e mão de obra.', 'Produtos de Limpeza': 'Giro médio e concorrência moderada.', 'Lavanderia': 'Marcas fortes e alta comparação.', 'Higiene Pessoal': 'Concorrência e giro médios.', 'Bebês': 'Produto ímã, margem competitiva.', 'Pet Shop': 'Ração gira; acessórios têm maior margem.' };
const parseBRL = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
const formatBRL = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parsePercent = (value) => Number(String(value || '').replace(',', '.')) || 0;
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export default function ERPProductsPage() {
  const [editId, setEditId] = useState('');
  const [product, setProduct] = useState(emptyProduct);
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState('Geral');
  const [newBarcode, setNewBarcode] = useState('');
  const [newTag, setNewTag] = useState('');
  const isEditing = Boolean(editId);
  const update = (key, value) => setProduct((current) => ({ ...current, [key]: value }));
  const toggleCategory = (category) => update('categories', product.categories.includes(category) ? product.categories.filter((item) => item !== category) : [...product.categories, category]);
  const togglePriceType = (type) => update('featuredPriceTypes', product.featuredPriceTypes.includes(type) ? product.featuredPriceTypes.filter((item) => item !== type) : [...product.featuredPriceTypes, type]);
  const addListValue = (key, value, clear) => { const normalized = String(value || '').trim(); if (!normalized) return; update(key, [...new Set([...(product[key] || []), normalized])]); clear(''); };
  const removeListValue = (key, value) => update(key, (product[key] || []).filter((item) => item !== value));
  const updatePromotionalPrice = (value) => {
    update('promotionalPrice', value);
  };
  const readImage = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update('image', String(reader.result));
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    setEditId(new URLSearchParams(window.location.search).get('edit') || '');
  }, []);
  useEffect(() => {
    if (!editId) return;
    fetch('/api/products')
      .then((response) => response.json())
      .then(({ products = [] }) => {
        const savedProduct = products.find((item) => item.id === editId);
        if (!savedProduct) return setFeedback('Produto não encontrado.');
        const savedCost = Number(savedProduct.cost) || 0;
        const savedPrice = Number(savedProduct.price) || 0;
        const savedMarkup = savedProduct.markupPercent ?? (savedCost ? ((savedPrice - savedCost) / savedCost) * 100 : 0);
        setProduct({ ...emptyProduct, ...savedProduct, price: formatBRL(savedPrice), cost: formatBRL(savedCost), promotionalPrice: formatBRL(savedProduct.promotionalPrice ?? savedPrice), markupPercent: savedMarkup.toFixed(2), discount: String(savedProduct.discount ?? 0), quantity: String(savedProduct.quantity ?? 0), categories: savedProduct.categories || [], barcodes: savedProduct.barcodes || (savedProduct.barcode ? [savedProduct.barcode] : []), featuredPriceTypes: savedProduct.featuredPriceTypes || [], tags: savedProduct.tags || [], suppliers: savedProduct.suppliers || [] });
      })
      .catch(() => setFeedback('Não foi possível carregar o produto.'));
  }, [editId]);
  useEffect(() => {
    const cost = parseBRL(product.cost);
    if (String(product.markupPercent || '').trim() === '') return;
    const markupPercent = Math.max(0, parsePercent(product.markupPercent));
    if (!cost) return;
    const price = roundMoney(cost * (1 + markupPercent / 100));
    setProduct((current) => ({ ...current, price: formatBRL(price) }));
  }, [product.cost, product.markupPercent]);
  useEffect(() => {
    const cost = parseBRL(product.cost);
    const price = parseBRL(product.price);
    const discount = Math.min(100, Math.max(0, parsePercent(product.discount)));
    const discountedPrice = price > 0 ? roundMoney(price * (1 - discount / 100)) : 0;
    const rawPromotionalPrice = parseBRL(product.promotionalPrice);
    const effectivePrice = rawPromotionalPrice > 0 ? rawPromotionalPrice : discountedPrice;
    const marginValue = roundMoney(effectivePrice - cost);
    setProduct((current) => ({ ...current, effectivePrice: formatBRL(effectivePrice), profitMarginPercent: effectivePrice > 0 ? ((marginValue / effectivePrice) * 100).toFixed(2) : '0.00', profitMarginValue: formatBRL(marginValue) }));
  }, [product.cost, product.price, product.promotionalPrice, product.discount]);
  useEffect(() => {
    const selectedCategory = product.categories.find((category) => markupSuggestions[category]);
    if (selectedCategory) update('suggestedMarkup', markupSuggestions[selectedCategory]);
  }, [product.categories]);
  const saveProduct = async (event) => {
    event.preventDefault();
    const cost = parseBRL(product.cost);
    const markupPercent = Math.max(0, parsePercent(product.markupPercent));
    const discount = Math.min(100, Math.max(0, parsePercent(product.discount)));
    const price = String(product.markupPercent || '').trim() !== '' && cost ? roundMoney(cost * (1 + markupPercent / 100)) : parseBRL(product.price);
    const promotionalPrice = parseBRL(product.promotionalPrice);
    const discountedPrice = roundMoney(price * (1 - discount / 100));
    const effectivePrice = promotionalPrice > 0 ? promotionalPrice : discountedPrice;
    const profitMarginValue = roundMoney(effectivePrice - cost);
    const response = await fetch('/api/products', { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...product, price, cost, promotionalPrice, profitMarginPercent: effectivePrice > 0 ? Number(((profitMarginValue / effectivePrice) * 100).toFixed(2)) : 0, profitMarginValue, markupPercent, barcodes: [...new Set([...(product.barcodes || []), product.barcode].filter(Boolean))], barcode: product.barcodes?.[0] || product.barcode || '', discount, quantity: Number(product.quantity || 0) }) });
    const data = await response.json();
    if (!response.ok) return setFeedback(data.error || 'Não foi possível salvar o produto.');
    setProduct(emptyProduct);
    setFeedback(isEditing ? 'Produto atualizado com sucesso.' : 'Produto salvo e publicado nas categorias selecionadas.');
  };

  const tabs = ['Geral', 'Preço', 'Estoque', 'Logística', 'Loja', 'SEO'];
  const priceTypes = ['Promoção', 'Oferta', 'Clube Hoje', 'Super Hoje'];
  const calculatedFields = ['profitMarginPercent', 'profitMarginValue'];
  const field = (label, key, type = 'text') => <label>{label}<input type={type === 'currency' ? 'text' : type} inputMode={type === 'currency' ? 'decimal' : undefined} value={product[key] ?? ''} readOnly={calculatedFields.includes(key)} onChange={(event) => key === 'promotionalPrice' ? updatePromotionalPrice(event.target.value) : update(key, event.target.value)} onBlur={type === 'currency' ? () => update(key, formatBRL(parseBRL(product[key]))) : undefined} /></label>;
  const selectedSuggestionCategory = product.categories.find((category) => markupSuggestions[category]);
  return <form className="shopify-product-page" onSubmit={saveProduct}>
    <header className="product-editor-header"><div className="product-editor-heading"><a href="/erp" className="back-link"><ArrowLeft size={17} /></a><div><span className="eyebrow">Catálogo operacional</span><h1>{isEditing ? 'Editar produto' : 'Adicionar produto'}</h1></div></div><button className="primary-cta"><Save size={15} /> {isEditing ? 'Atualizar produto' : 'Salvar produto'}</button></header>
    <div className="product-editor-tabs">{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    <div className="product-editor-layout"><main className="product-editor-main">
      {activeTab === 'Geral' && <><section className="editor-card"><h2>Informações do produto</h2>{field('Nome do produto', 'title')}<label>Descrição<textarea value={product.description} onChange={(event) => update('description', event.target.value)} rows="4" /></label><div className="editor-form-grid three">{field('SKU', 'sku')}{field('Marca', 'brand')}{field('Fabricante', 'manufacturer')}</div></section><section className="editor-card"><h2>Códigos de barras</h2><div className="editor-inline"><input value={newBarcode} onChange={(event) => setNewBarcode(event.target.value)} placeholder="EAN, GTIN ou código interno" /><button type="button" className="editor-link" onClick={() => addListValue('barcodes', newBarcode, setNewBarcode)}><Plus size={15} /> Adicionar</button></div><div className="editor-chip-list">{product.barcodes.map((code) => <span key={code}>{code}<button type="button" onClick={() => removeListValue('barcodes', code)} aria-label={`Remover código ${code}`}><Trash2 size={13} /></button></span>)}</div></section><section className="editor-card"><h2>Organização</h2><div className="editor-form-grid three">{field('Departamento', 'department')}{field('Categoria', 'subcategory')}{field('Coleção', 'collection')}{field('Tipo de produto', 'productType')}{field('Fornecedor principal', 'supplier')}{field('Status', 'status')}</div><p className="editor-hint">Categorias principais</p><div className="category-checklist">{categories.map((category) => <label key={category}><input type="checkbox" checked={product.categories.includes(category)} onChange={() => toggleCategory(category)} /> {category}</label>)}</div></section></>}
      {activeTab === 'Preço' && <><section className="editor-card"><h2>Preços e markup</h2><div className="editor-form-grid three">{field('Custo de compra', 'cost', 'currency')}{field('Preço de venda', 'price', 'currency')}{field('Preço promocional', 'promotionalPrice', 'currency')}{field('Desconto (%)', 'discount', 'number')}{field('Margem de lucro (%)', 'profitMarginPercent', 'number')}{field('Margem de lucro (R$)', 'profitMarginValue', 'currency')}{field('Markup (%)', 'markupPercent', 'number')}</div><div className="effective-price-note">Preço efetivo considerado: <strong>{product.effectivePrice || 'informe os preços'}</strong><small>Usa o preço promocional quando informado; caso contrário, usa o preço de venda.</small></div><p className="editor-hint">O markup calcula automaticamente: custo de compra × (1 + markup ÷ 100) = preço de venda. Promoção e desconto atualizam a margem com base no preço efetivo.</p><div className="markup-suggestion"><strong>Sugestão para {selectedSuggestionCategory || 'a categoria selecionada'}</strong><span>Markup sugerido: {product.suggestedMarkup || 'selecione uma categoria'}</span><small>{markupStrategy[selectedSuggestionCategory] || 'Escolha uma categoria para receber uma referência de precificação.'}</small></div><label>Tipo de preço<select value={product.priceType} onChange={(event) => update('priceType', event.target.value)}><option>Normal</option>{priceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><p className="editor-hint">Tipos de vitrine</p><div className="price-type-bubbles">{priceTypes.map((type) => <button type="button" key={type} className={product.featuredPriceTypes.includes(type) ? 'active' : ''} onClick={() => togglePriceType(type)}>{type}</button>)}</div></section><section className="editor-card"><h2>Promoção</h2><div className="editor-form-grid three">{field('Data inicial', 'promotionStart', 'date')}{field('Data final', 'promotionEnd', 'date')}{field('Limite por cliente', 'promotionLimit', 'number')}{field('Estoque promocional', 'promotionStock', 'number')}{field('Tipo de promoção', 'promotionType')}</div></section></>}
      {activeTab === 'Estoque' && <><section className="editor-card"><h2>Estoque e rastreabilidade</h2><div className="editor-form-grid three">{field('Quantidade', 'quantity', 'number')}{field('Estoque mínimo', 'minStock', 'number')}{field('Estoque máximo', 'maxStock', 'number')}{field('Localização', 'location')}{field('Lote', 'lot')}{field('Número de série', 'serialNumber')}{field('Data de fabricação', 'manufactureDate', 'date')}{field('Data de validade', 'expiry', 'date')}{field('Validade mínima para venda', 'minimumShelfLife')}</div><div className="editor-toggle-grid"><label><input type="checkbox" checked={product.controlsLot} onChange={(event) => update('controlsLot', event.target.checked)} /> Controla lote</label><label><input type="checkbox" checked={product.controlsExpiry} onChange={(event) => update('controlsExpiry', event.target.checked)} /> Controla validade</label><label><input type="checkbox" checked={product.perishable} onChange={(event) => update('perishable', event.target.checked)} /> Perecível</label></div></section></>}
      {activeTab === 'Logística' && <section className="editor-card"><h2>Logística e conservação</h2><div className="editor-form-grid three">{field('Peso', 'weight')}{field('Altura', 'height')}{field('Largura', 'width')}{field('Comprimento', 'length')}{field('Peso da embalagem', 'packageWeight')}{field('Tipo de embalagem', 'packageType')}{field('Unidade de transporte', 'transportUnit')}{field('Forma de venda', 'saleUnit')}</div><div className="editor-toggle-grid"><label><input type="checkbox" checked={product.fractionalSale} onChange={(event) => update('fractionalSale', event.target.checked)} /> Permite venda fracionada</label><label><input type="checkbox" checked={product.fragile} onChange={(event) => update('fragile', event.target.checked)} /> Frágil</label><label><input type="checkbox" checked={product.refrigerated} onChange={(event) => update('refrigerated', event.target.checked)} /> Refrigerado</label><label><input type="checkbox" checked={product.frozen} onChange={(event) => update('frozen', event.target.checked)} /> Congelado</label><label><input type="checkbox" checked={product.roomTemperature} onChange={(event) => update('roomTemperature', event.target.checked)} /> Temperatura ambiente</label><label><input type="checkbox" checked={product.specialCare} onChange={(event) => update('specialCare', event.target.checked)} /> Cuidado especial</label></div></section>}
      {activeTab === 'Loja' && <><section className="editor-card"><h2>Imagem da loja</h2><div className="media-dropzone"><ImagePlus size={28} /><strong>Selecione uma imagem</strong><span>A imagem será exibida na loja.</span><input type="file" accept="image/*" onChange={readImage} /></div>{product.image && <div className="media-preview-grid"><img src={product.image} alt="Prévia do produto" /></div>}</section><section className="editor-card"><h2>Tags e fornecedores</h2><div className="editor-inline"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Ex.: sem lactose" /><button type="button" className="editor-link" onClick={() => addListValue('tags', newTag, setNewTag)}><Plus size={15} /> Adicionar tag</button></div><div className="editor-chip-list">{product.tags.map((tag) => <span key={tag}>{tag}<button type="button" onClick={() => removeListValue('tags', tag)} aria-label={`Remover tag ${tag}`}><Trash2 size={13} /></button></span>)}</div><p className="editor-hint">Fornecedores alternativos e dados de compra podem ser adicionados depois no mesmo cadastro.</p></section></>}
      {activeTab === 'SEO' && <section className="editor-card"><h2>SEO e descoberta</h2>{field('Título SEO', 'seoTitle')}{field('URL amigável', 'seoSlug')}<label>Meta descrição<textarea value={product.metaDescription || ''} onChange={(event) => update('metaDescription', event.target.value)} rows="4" /></label>{field('Palavras-chave', 'seoKeywords')}</section>}
    </main><aside className="product-editor-side"><section className="editor-card"><h2>Resumo</h2><p className="editor-hint">Preencha as abas para manter preço, estoque, logística e vitrine consistentes.</p><span className="status-pill ok">{product.status}</span></section></aside></div>{feedback && <div className="editor-saved"><Check size={15} /> {feedback}</div>}
  </form>;
}
