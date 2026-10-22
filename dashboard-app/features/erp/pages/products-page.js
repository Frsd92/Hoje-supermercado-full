'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, Check, FileUp, ImagePlus, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatAuditValue } from '../api/product-audit.js';
import { normalizeProductBarcode } from '../api/product-barcode-lookup.js';
import { getProductOrganizationError, normalizeProductOrganizationValue, usesHortifrutiOrganization } from '../product-organization.js';
import { calculateProductPricing, formatBRL, parseBRL, parsePercent, priceFromMarkup, roundMoney } from './product-pricing.js';
import { encodeProductImage } from './product-image.js';

const categories = ['Hortifruti', 'Açougue', 'Padaria', 'Mercearia', 'Bebidas', 'Vinhos', 'Bebidas Alcoólicas', 'Cervejas', 'Produtos de Limpeza', 'Lavanderia', 'Pet Shop', 'Higiene Pessoal', 'Bomboniere', 'Laticínios', 'Bebês'];
const emptyProduct = { title: '', description: '', price: '', cost: '', promotionalPrice: '', discount: '', profitMarginPercent: '', profitMarginValue: '', markupPercent: '', suggestedMarkup: '', priceType: 'Normal', featuredPriceTypes: [], barcodes: [], barcode: '', sku: '', ncm: '', expiry: '', lot: '', manufactureDate: '', controlsLot: false, controlsExpiry: false, minimumShelfLife: '', serialNumber: '', quantity: '0', minStock: '0', maxStock: '', location: '', weight: '', height: '', width: '', length: '', packageWeight: '', packageType: '', transportUnit: '', fragile: false, refrigerated: false, frozen: false, roomTemperature: true, specialCare: false, saleUnit: 'Unidade', fractionalSale: false, brand: '', manufacturer: '', supplier: '', suppliers: [], categories: [], department: '', subcategory: '', tags: [], collection: '', productType: '', perishable: false, seasonal: false, exclusive: false, promotionStart: '', promotionEnd: '', promotionLimit: '', promotionStock: '', promotionType: '', image: '', status: 'Ativo' };
const markupSuggestions = { 'Mercearia': '20% a 35%', 'Cervejas': '15% a 25%', 'Bebidas': '30% a 45%', 'Laticínios': '25% a 40%', 'Bebidas Alcoólicas': '40% a 60%', 'Vinhos': '50% a 80%', 'Bomboniere': '45% a 65%', 'Açougue': '35% a 55%', 'Hortifruti': '55% a 80%', 'Padaria': '100% a 150%', 'Produtos de Limpeza': '35% a 45%', 'Lavanderia': '25% a 35%', 'Higiene Pessoal': '35% a 50%', 'Bebês': '15% a 30%', 'Pet Shop': '35% a 55%' };
const markupStrategy = { 'Mercearia': 'Giro alto e preço competitivo.', 'Cervejas': 'Produto isca e volume.', 'Bebidas': 'Giro alto e custo de refrigeração.', 'Laticínios': 'Giro rápido e validade rigorosa.', 'Bebidas Alcoólicas': 'Menor giro e maior valor agregado.', 'Vinhos': 'Experiência de compra e maior valor.', 'Bomboniere': 'Compra por impulso.', 'Açougue': 'Cobre operação, energia e quebra.', 'Hortifruti': 'Protege contra desperdício.', 'Padaria': 'Cobre transformação e mão de obra.', 'Produtos de Limpeza': 'Giro médio e concorrência moderada.', 'Lavanderia': 'Marcas fortes e alta comparação.', 'Higiene Pessoal': 'Concorrência e giro médios.', 'Bebês': 'Produto ímã, margem competitiva.', 'Pet Shop': 'Ração gira; acessórios têm maior margem.' };
const isKilogramSaleUnit = (value) => /^(kg|quilo|quilograma)s?$/i.test(String(value || '').trim());
const auditFieldLabels = { title: 'Nome', description: 'Descrição', price: 'Preço', cost: 'Custo', discount: 'Desconto', quantity: 'Estoque', sku: 'SKU', barcode: 'Código de barras', barcodes: 'Códigos de barras', ncm: 'NCM', brand: 'Marca', manufacturer: 'Fabricante', supplier: 'Fornecedor', suppliers: 'Fornecedores', subcategory: 'Categoria', categories: 'Categorias', image: 'Imagem', status: 'Status', expiry: 'Validade', shelfLifeDays: 'Prazo padrão de validade (dias)', saleUnit: 'Unidade de venda', priceHistory: 'Histórico de preços', createdAt: 'Criado em', createdBy: 'Criado por', updatedAt: 'Atualizado em', updatedBy: 'Atualizado por' };
const auditActionLabels = { CREATE: 'Produto cadastrado', UPDATE: 'Produto atualizado', DELETE: 'Produto excluído', LEGACY_BASELINE: 'Snapshot inicial legado', LEGACY_PRICE_HISTORY: 'Registro legado de preço' };
const formatAuditDate = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));

export default function ERPProductsPage() {
  const [editId, setEditId] = useState('');
  const [product, setProduct] = useState(emptyProduct);
  const [feedback, setFeedback] = useState('');
  const [blingSync, setBlingSync] = useState({ status: 'not_synced', error: '' });
  const [retryingBling, setRetryingBling] = useState(false);
  const [createdProductReference, setCreatedProductReference] = useState('');
  const [activeTab, setActiveTab] = useState('Geral');
  const [newBarcode, setNewBarcode] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [barcodeLookupStatus, setBarcodeLookupStatus] = useState('idle');
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState('');
  const [barcodeSuggestion, setBarcodeSuggestion] = useState('');
  const [ncmValidation, setNcmValidation] = useState({ status: 'idle', message: '', description: '' });
  const [ncmSearch, setNcmSearch] = useState('');
  const [ncmSearchResults, setNcmSearchResults] = useState([]);
  const [ncmSearchMessage, setNcmSearchMessage] = useState('');
  const [ncmXmlSuggestions, setNcmXmlSuggestions] = useState([]);
  const [ncmXmlSource, setNcmXmlSource] = useState('');
  const [ncmXmlNotice, setNcmXmlNotice] = useState('');
  const [ncmBusy, setNcmBusy] = useState(false);
  const ncmXmlRef = useRef(null);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditRefresh, setAuditRefresh] = useState(0);
  const barcodeLookupController = useRef(null);
  const lastBarcodeLookup = useRef('');
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
  const validateNcm = async (value = product.ncm) => {
    const code = String(value || '').trim();
    if (!code) {
      setNcmValidation({ status: 'invalid', message: 'Informe um NCM para validar.', description: '' });
      return false;
    }
    setNcmBusy(true);
    setNcmValidation({ status: 'loading', message: 'Consultando a tabela oficial vigente...', description: '' });
    try {
      const response = await fetch(`/api/erp/products/ncm?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.status === 422) {
        setNcmValidation({ status: 'invalid', message: result.error || 'NCM inválido.', description: '' });
        return false;
      }
      if (!response.ok) throw new Error(result.error || 'Não foi possível validar o NCM.');
      setNcmValidation({
        status: 'valid',
        message: result.updatedAt ? `NCM vigente na tabela oficial (${result.updatedAt}).` : 'NCM vigente na tabela oficial.',
        description: result.description,
      });
      return true;
    } catch (error) {
      setNcmValidation({ status: 'error', message: error.message || 'Não foi possível validar o NCM.', description: '' });
      return false;
    } finally {
      setNcmBusy(false);
    }
  };
  const searchNcm = async () => {
    if (ncmSearch.trim().length < 2) {
      setNcmSearchMessage('Digite pelo menos 2 caracteres para pesquisar na tabela oficial.');
      setNcmSearchResults([]);
      return;
    }
    setNcmBusy(true);
    setNcmSearchMessage('');
    try {
      const response = await fetch(`/api/erp/products/ncm?search=${encodeURIComponent(ncmSearch.trim())}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível pesquisar NCMs.');
      setNcmSearchResults(result.entries || []);
      setNcmSearchMessage(result.entries?.length
        ? `Resultados da tabela oficial vigente${result.updatedAt ? ` (${result.updatedAt})` : ''}. Confirme a classificação com o contador.`
        : 'Nenhum código vigente encontrado para essa pesquisa.');
    } catch (error) {
      setNcmSearchMessage(error.message || 'Não foi possível pesquisar NCMs.');
      setNcmSearchResults([]);
    } finally {
      setNcmBusy(false);
    }
  };
  const importNcmFromXml = async (event) => {
    event.preventDefault();
    const xml = ncmXmlRef.current?.files?.[0];
    if (!xml) {
      setNcmXmlNotice('Selecione o XML da NF-e do fornecedor.');
      return;
    }
    setNcmBusy(true);
    setNcmXmlNotice('');
    setNcmXmlSuggestions([]);
    try {
      const formData = new FormData();
      formData.append('xml', xml);
      formData.append('barcode', product.barcode || product.barcodes?.[0] || '');
      formData.append('sku', product.sku || '');
      const response = await fetch('/api/erp/products/ncm', { method: 'POST', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível importar o XML.');
      setNcmXmlSuggestions(result.suggestions || []);
      setNcmXmlSource(`NF-e ${result.invoice.number || 'sem número'} · ${result.invoice.issuerName || 'fornecedor'}${result.invoice.authorized ? '' : ' · protocolo de autorização não confirmado'}`);
      const barcodeMatches = result.suggestions?.filter((item) => item.matchType === 'barcode') || [];
      const matchedNcms = [...new Set(barcodeMatches.map((item) => item.ncm))];
      if (matchedNcms.length === 1) {
        update('ncm', matchedNcms[0]);
        setNcmXmlNotice('NCM preenchido como sugestão a partir do item com código de barras correspondente. Confira a descrição e confirme a classificação com o contador.');
        await validateNcm(matchedNcms[0]);
      } else {
        setNcmXmlNotice(result.suggestions?.length
          ? `${result.suggestions.length} item(ns) com NCM no XML. Confira e selecione a sugestão correta; a correspondência exata por código de barras aparece primeiro.`
          : 'O XML não contém itens com NCM disponível.');
      }
      if (ncmXmlRef.current) ncmXmlRef.current.value = '';
    } catch (error) {
      setNcmXmlNotice(error.message || 'Não foi possível importar o XML.');
    } finally {
      setNcmBusy(false);
    }
  };
  const loadLinkedInvoiceNcm = async () => {
    if (!editId) return;
    setNcmBusy(true);
    setNcmXmlNotice('');
    setNcmXmlSuggestions([]);
    try {
      const response = await fetch(`/api/erp/products/ncm?productId=${encodeURIComponent(editId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível consultar NF-e importadas.');
      const suggestions = (result.suggestions || []).map((item) => ({ ...item, matchType: 'linked' }));
      setNcmXmlSuggestions(suggestions);
      setNcmXmlSource('Itens de NF-e de fornecedores já importadas e vinculadas a este produto.');
      const matchedNcms = [...new Set(suggestions.map((item) => item.ncm))];
      if (matchedNcms.length === 1) {
        update('ncm', matchedNcms[0]);
        setNcmXmlNotice('NCM preenchido como sugestão da NF-e vinculada. Confira a descrição e confirme a classificação com o contador.');
        await validateNcm(matchedNcms[0]);
      } else {
        setNcmXmlNotice(suggestions.length
          ? 'Há códigos diferentes em NF-e vinculadas. Confira cada item e selecione a sugestão correta.'
          : 'Nenhuma NF-e importada vinculada a este produto contém NCM.');
      }
    } catch (error) {
      setNcmXmlNotice(error.message || 'Não foi possível consultar NF-e importadas.');
    } finally {
      setNcmBusy(false);
    }
  };
  const toggleCategory = (category) => update('categories', product.categories.includes(category) ? product.categories.filter((item) => item !== category) : [...product.categories, category]);
  const togglePriceType = (type) => update('featuredPriceTypes', product.featuredPriceTypes.includes(type) ? product.featuredPriceTypes.filter((item) => item !== type) : [...product.featuredPriceTypes, type]);
  const addListValue = (key, value, clear) => { const normalized = String(value || '').trim(); if (!normalized) return; update(key, [...new Set([...(product[key] || []), normalized])]); clear(''); };
  const removeListValue = (key, value) => setProduct((current) => {
    const nextValues = (current[key] || []).filter((item) => item !== value);
    return {
      ...current,
      [key]: nextValues,
      ...(key === 'barcodes' && current.barcode === value ? { barcode: nextValues[0] || '' } : {}),
    };
  });
  const lookupProductByBarcode = useCallback(async (value) => {
    const barcode = normalizeProductBarcode(value);
    if (!barcode || lastBarcodeLookup.current === barcode) return;

    lastBarcodeLookup.current = barcode;
    barcodeLookupController.current?.abort();
    const controller = new AbortController();
    barcodeLookupController.current = controller;
    setBarcodeLookupStatus('loading');
    setBarcodeLookupMessage('Consultando o catálogo de produtos...');
    setBarcodeSuggestion('');

    try {
      const response = await fetch(`/api/products/lookup-barcode?barcode=${encodeURIComponent(barcode)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 404) {
          setBarcodeLookupStatus('not-found');
          setBarcodeLookupMessage(data.error || 'Código não encontrado. Informe o nome manualmente.');
          return;
        }
        throw new Error(data.error || 'Não foi possível consultar o catálogo.');
      }

      const productName = String(data.productName || '').trim();
      if (!productName) {
        setBarcodeLookupStatus('not-found');
        setBarcodeLookupMessage('O catálogo não retornou um nome. Informe o nome manualmente.');
        return;
      }

      setBarcodeSuggestion(productName);
      setBarcodeLookupStatus('found');
      setBarcodeLookupMessage(`Sugestão do Open Food Facts: ${productName}. Confira antes de salvar.`);
      setProduct((current) => ({
        ...current,
        title: String(current.title || '').trim() ? current.title : productName,
      }));
    } catch (error) {
      if (controller.signal.aborted) return;
      lastBarcodeLookup.current = '';
      console.error('Não foi possível buscar o produto pelo código de barras:', error);
      setBarcodeLookupStatus('error');
      setBarcodeLookupMessage(error.message || 'Não foi possível consultar o catálogo. Informe o nome manualmente.');
    }
  }, []);
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
    const barcode = normalizeProductBarcode(barcodeSearch);
    if (!barcode) {
      barcodeLookupController.current?.abort();
      lastBarcodeLookup.current = '';
      setBarcodeLookupStatus('idle');
      setBarcodeLookupMessage('');
      setBarcodeSuggestion('');
      return undefined;
    }

    const timeout = setTimeout(() => {
      void lookupProductByBarcode(barcode);
    }, 700);
    return () => {
      clearTimeout(timeout);
      barcodeLookupController.current?.abort();
    };
  }, [barcodeSearch, lookupProductByBarcode]);
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setEditId(searchParams.get('edit') || '');
    if (searchParams.get('tab') === 'estoque') setActiveTab('Estoque');
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
        const subcategory = usesHortifrutiOrganization(savedProduct)
          && normalizeProductOrganizationValue(savedProduct.subcategory) === 'hortifruti'
          ? savedProduct.productType || ''
          : savedProduct.subcategory || '';
        setProduct({ ...emptyProduct, ...savedProduct, subcategory, saleUnit, fractionalSale: saleUnit === 'Quilograma', price: formatBRL(savedPrice), cost: formatBRL(savedCost), promotionalPrice: savedProduct.promotionalPrice ? formatBRL(savedProduct.promotionalPrice) : '', markupPercent: savedMarkup === '' ? '' : Number(savedMarkup).toFixed(2), discount: String(savedProduct.discount ?? 0), quantity: String(savedProduct.quantity ?? 0), categories: savedProduct.categories || [], barcodes: savedProduct.barcodes || (savedProduct.barcode ? [savedProduct.barcode] : []), featuredPriceTypes: savedProduct.featuredPriceTypes || [], tags: savedProduct.tags || [], suppliers: savedProduct.suppliers || [] });
        setBlingSync({ status: savedProduct.blingSyncStatus || 'not_synced', error: savedProduct.blingSyncError || '' });
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
    }));
  }, [product.cost, product.price, product.promotionalPrice, product.discount]);
  useEffect(() => {
    const selectedCategory = product.categories.find((category) => markupSuggestions[category]);
    if (selectedCategory) update('suggestedMarkup', markupSuggestions[selectedCategory]);
  }, [product.categories]);
  const saveProduct = async (event) => {
    event.preventDefault();
    const organizationError = getProductOrganizationError(product);
    if (organizationError) {
      setFeedback(organizationError);
      setActiveTab('Geral');
      return;
    }
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
      const productBarcodes = [...new Set([...(product.barcodes || []), product.barcode].filter(Boolean))];
      const response = await fetch('/api/products', { method: isEditing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...product, fractionalSale: product.saleUnit === 'Quilograma', price, cost, promotionalPrice, profitMarginPercent: effectivePrice > 0 ? Number(((profitMarginValue / effectivePrice) * 100).toFixed(2)) : 0, profitMarginValue, markupPercent, barcodes: productBarcodes, barcode: productBarcodes[0] || '', discount, quantity: isEditing ? Number(product.quantity || 0) : 0 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o produto.');
      const sync = data.product?.blingSync || {
        status: data.product?.blingSyncStatus || 'not_synced',
        error: data.product?.blingSyncError || '',
      };
      setBlingSync(sync);
      if (!isEditing) {
        const productReference = String(data.product?.id || '').trim();
        if (productReference) {
          if (sync.status === 'synced') {
            window.location.assign(`/erp/registrar-lote?productId=${encodeURIComponent(productReference)}`);
            return;
          }
          setCreatedProductReference(productReference);
          setProduct(emptyProduct);
          setFeedback(sync.error
            ? `Produto cadastrado no Hoje, mas a sincronização com o Bling não foi concluída: ${sync.error}`
            : 'Produto cadastrado no Hoje. A sincronização com o Bling ainda não foi confirmada.');
          return;
        }
        setProduct(emptyProduct);
        setFeedback('Produto cadastrado. Acesse Registrar lote para informar o estoque inicial.');
        return;
      }
      setProduct((current) => ({ ...current, ...data.product, price: formatBRL(data.product.price), cost: formatBRL(data.product.cost), promotionalPrice: formatBRL(data.product.promotionalPrice ?? data.product.price) }));
      setAuditRefresh((current) => current + 1);
      setFeedback(['synced', 'partial'].includes(sync.status)
        ? sync.error
          ? `Produto atualizado. Sincronização parcial com o Bling: ${sync.error}`
          : 'Produto atualizado e sincronizado com o Bling.'
        : `Produto atualizado no Hoje, mas a sincronização com o Bling não foi concluída: ${sync.error || 'verifique o status e tente novamente.'}`);
    } catch (error) {
      setFeedback(error.message || 'Não foi possível salvar o produto.');
    } finally {
      setSaving(false);
    }
  };
  const retryBlingSync = async () => {
    if (!editId) return;
    setRetryingBling(true);
    setFeedback('');
    try {
      const response = await fetch(`/api/erp/bling/products/${encodeURIComponent(editId)}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok && !data.sync) throw new Error(data.error || 'Não foi possível sincronizar o produto.');
      const sync = data.sync;
      setBlingSync(sync);
      setFeedback(['synced', 'partial'].includes(sync.status)
        ? sync.error
          ? `Sincronização parcial concluída: ${sync.error}`
          : 'Produto sincronizado com o Bling.'
        : `Sincronização não concluída: ${sync.error || 'tente novamente.'}`);
    } catch (error) {
      setFeedback(error.message || 'Não foi possível sincronizar o produto.');
    } finally {
      setRetryingBling(false);
    }
  };

  const tabs = ['Geral', 'Fiscal', 'Preço', 'Estoque', 'Logística', 'Loja', 'SEO'];
  const priceTypes = ['Promoção', 'Oferta', 'Clube Hoje', 'Super Hoje'];
  const calculatedFields = ['profitMarginPercent', 'profitMarginValue'];
  const requiresHortifrutiOrganization = usesHortifrutiOrganization(product);
  const field = (label, key, type = 'text', inputProps = {}) => <label>{label}<input {...inputProps} type={type === 'currency' ? 'text' : type} inputMode={inputProps.inputMode || (type === 'currency' ? 'decimal' : undefined)} value={product[key] ?? ''} readOnly={Boolean(inputProps.readOnly) || calculatedFields.includes(key)} onChange={(event) => {
    const value = event.target.value;
    if (key === 'promotionalPrice') updatePromotionalPrice(value);
    else update(key, value);
  }} onBlur={type === 'currency' ? () => update(key, formatBRL(parseBRL(product[key]))) : undefined} /></label>;
  const selectedSuggestionCategory = product.categories.find((category) => markupSuggestions[category]);
  return <form className="shopify-product-page" onSubmit={saveProduct}>
    <header className="product-editor-header"><div className="product-editor-heading"><a href="/erp/products" className="back-link"><ArrowLeft size={17} /></a><div><span className="eyebrow">Cadastro de produto</span><h1>{isEditing ? 'Alterar cadastro' : 'Cadastrar produto'}</h1></div></div><button className="primary-cta" disabled={saving}><Save size={15} /> {saving ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Salvar produto'}</button></header>
    <div className="product-editor-tabs">{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
    <div className="product-editor-layout"><main className="product-editor-main">
      {activeTab === 'Geral' && <>
        <section className="editor-card product-barcode-lookup">
          <h2>Buscar nome pelo código de barras</h2>
          <p className="editor-hint">Leia ou digite um código para consultar uma sugestão de nome. Este campo serve apenas para busca e não salva o código no produto.</p>
          <label htmlFor="product-barcode-lookup-input">Código para consulta</label>
          <div className="editor-inline">
            <input
              id="product-barcode-lookup-input"
              value={barcodeSearch}
              onChange={(event) => {
                setBarcodeSearch(event.target.value);
                setBarcodeLookupStatus('idle');
                setBarcodeLookupMessage('');
                setBarcodeSuggestion('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void lookupProductByBarcode(barcodeSearch);
                }
              }}
              autoComplete="off"
              inputMode="numeric"
              placeholder="Escaneie ou digite 8 a 14 dígitos"
              aria-describedby="product-barcode-lookup-help product-barcode-lookup-status"
            />
          </div>
          <p id="product-barcode-lookup-help" className="editor-hint">A busca consulta um catálogo público; confira a sugestão antes de salvar o produto.</p>
          <div id="product-barcode-lookup-status" className={`product-barcode-lookup-status ${barcodeLookupStatus}`} role={barcodeLookupStatus === 'error' ? 'alert' : 'status'} aria-live="polite">{barcodeLookupMessage}</div>
          {barcodeLookupStatus === 'found' && barcodeSuggestion && String(product.title || '').trim() !== barcodeSuggestion && <button type="button" className="editor-link product-barcode-suggestion" onClick={() => setProduct((current) => ({ ...current, title: barcodeSuggestion }))}>Usar nome encontrado: {barcodeSuggestion}</button>}
          {barcodeLookupStatus === 'error' && <button type="button" className="editor-link product-barcode-suggestion" onClick={() => { lastBarcodeLookup.current = ''; void lookupProductByBarcode(barcodeSearch); }}>Tentar novamente</button>}
        </section>
        <section className="editor-card">
          <h2>Informações do produto</h2>
          {field('Nome do produto', 'title')}
          <label>Descrição<textarea value={product.description} onChange={(event) => update('description', event.target.value)} rows="4" /></label>
          <div className="editor-form-grid three">{field('SKU', 'sku')}{field('Marca', 'brand')}{field('Fabricante', 'manufacturer')}</div>
        </section>
        <section className="editor-card">
          <h2>Códigos de barras</h2>
          <div className="editor-inline">
            <input value={newBarcode} onChange={(event) => setNewBarcode(event.target.value)} placeholder="EAN, GTIN ou código interno" />
            <button type="button" className="editor-link" onClick={() => addListValue('barcodes', newBarcode, setNewBarcode)}><Plus size={15} /> Adicionar</button>
          </div>
          <div className="editor-chip-list">{product.barcodes.map((code) => <span key={code}>{code}<button type="button" onClick={() => removeListValue('barcodes', code)} aria-label={`Remover código ${code}`}><Trash2 size={13} /></button></span>)}</div>
        </section>
        <section className="editor-card">
          <h2>Organização</h2>
          <div className="editor-form-grid three">{field('Departamento', 'department', 'text', { placeholder: 'Ex.: Hortifruti', required: requiresHortifrutiOrganization })}{field('Categoria (ex.: Fruta)', 'subcategory', 'text', { placeholder: 'Ex.: Fruta', required: requiresHortifrutiOrganization })}{field('Coleção', 'collection')}{field('Tipo de produto', 'productType')}{field('Fornecedor principal', 'supplier')}{field('Status', 'status')}</div>
          {requiresHortifrutiOrganization && <p className="product-organization-help"><strong>Organização de Hortifruti:</strong> selecione Hortifruti em Categorias, preencha Departamento como Hortifruti e informe uma categoria específica, como Fruta ou Verdura. Esse campo define o rótulo exibido no produto.</p>}
          <p className="editor-hint">Categorias principais</p>
          <div className="category-checklist">{categories.map((category) => <label key={category}><input type="checkbox" checked={product.categories.includes(category)} onChange={() => toggleCategory(category)} /> {category}</label>)}</div>
        </section>
      </>}
      {activeTab === 'Fiscal' && <section className="editor-card">
        <h2>Classificação fiscal</h2>
        <p className="editor-hint">Informe o NCM confirmado para este produto. A validação consulta a tabela vigente oficial do Siscomex/Classif; a descrição ajuda a conferir, mas não substitui a classificação do contador.</p>
        <div className="editor-form-grid">
          <label>NCM
            <input
              value={product.ncm || ''}
              onChange={(event) => {
                update('ncm', event.target.value);
                setNcmValidation({ status: 'idle', message: '', description: '' });
              }}
              inputMode="numeric"
              maxLength={10}
              placeholder="Ex.: 0201.10.00"
              aria-describedby="product-ncm-validation"
            />
          </label>
          <div className="editor-inline">
            <button type="button" className="editor-link" onClick={() => void validateNcm()} disabled={ncmBusy}>
              <BadgeCheck size={15} /> {ncmBusy ? 'Consultando…' : 'Validar NCM oficial'}
            </button>
            {ncmValidation.status === 'valid' && <span aria-label="NCM validado"><Check size={16} /> NCM válido</span>}
          </div>
        </div>
        <p id="product-ncm-validation" className="editor-hint" role={ncmValidation.status === 'invalid' || ncmValidation.status === 'error' ? 'alert' : 'status'}>
          {ncmValidation.message}{ncmValidation.description ? ` Descrição oficial: ${ncmValidation.description}` : ''}
        </p>

        <div className="editor-divider">
          <h3>Pesquisar na tabela oficial</h3>
          <p className="editor-hint">Pesquise pelo código ou por termos da descrição para revisar opções. A seleção do NCM deve ser confirmada por quem responde pela classificação fiscal.</p>
          <div className="editor-inline">
            <input
              value={ncmSearch}
              onChange={(event) => setNcmSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchNcm();
                }
              }}
              placeholder="Código ou descrição do produto"
              aria-label="Pesquisar tabela oficial de NCM"
            />
            <button type="button" className="editor-link" onClick={() => void searchNcm()} disabled={ncmBusy}><Search size={15} /> Pesquisar</button>
          </div>
          {ncmSearchMessage && <p className="editor-hint" role="status">{ncmSearchMessage}</p>}
          {ncmSearchResults.length > 0 && <div className="editor-chip-list">
            {ncmSearchResults.map((entry) => <button key={entry.code} type="button" className="editor-link" onClick={() => {
              update('ncm', entry.code);
              void validateNcm(entry.code);
            }}>{entry.code} · {entry.description}</button>)}
          </div>}
        </div>

        <div className="editor-divider">
          <h3>Importar sugestão do XML de fornecedor</h3>
          <p className="editor-hint">Importe o XML original da NF-e. O sistema sugere NCMs dos itens que correspondem ao código de barras ou SKU informado; se não houver correspondência exata, você pode conferir os itens manualmente. O XML não comprova sozinho a autorização fiscal.</p>
          <form className="editor-inline" onSubmit={importNcmFromXml}>
            <input ref={ncmXmlRef} type="file" accept=".xml,text/xml,application/xml" aria-label="XML da nota fiscal do fornecedor" disabled={ncmBusy} />
            <button type="submit" className="editor-link" disabled={ncmBusy}><FileUp size={15} /> {ncmBusy ? 'Lendo XML…' : 'Importar XML'}</button>
          </form>
          {ncmXmlSource && <p className="editor-hint">{ncmXmlSource}</p>}
          {ncmXmlNotice && <p className="editor-hint" role="status">{ncmXmlNotice}</p>}
          {isEditing && <button type="button" className="editor-link" onClick={() => void loadLinkedInvoiceNcm()} disabled={ncmBusy}>
            <FileUp size={15} /> Usar NF-e de fornecedor já importada
          </button>}
          {ncmXmlSuggestions.length > 0 && <div className="editor-ncm-suggestions">
            {ncmXmlSuggestions.map((suggestion, index) => <button
              type="button"
              className="editor-link"
              key={`${suggestion.ncm}-${suggestion.ean}-${index}`}
              onClick={() => {
                update('ncm', suggestion.ncm);
                void validateNcm(suggestion.ncm);
              }}
            >
              {suggestion.matchType === 'barcode' ? 'Correspondência pelo código de barras' : suggestion.matchType === 'sku' ? 'Correspondência pelo SKU' : suggestion.matchType === 'linked' ? `NF-e ${suggestion.invoiceNumber || ''} · ${suggestion.issuerName || 'Fornecedor'}` : 'Conferir item'}
              {' · '}{suggestion.ncm} · {suggestion.description}
            </button>)}
          </div>}
        </div>
        <p className="editor-hint"><strong>Importante:</strong> o XML é uma sugestão do fornecedor, não uma confirmação da classificação do seu estabelecimento. Revise o produto, a vigência do código e a tributação com o contador antes de usar em emissão fiscal.</p>
      </section>}
      {activeTab === 'Fiscal' && <section className="editor-card">
        <h2>Sincronização com Bling</h2>
        <p className="editor-hint">Ao salvar o produto, o ERP envia o cadastro para a conta Bling conectada. A autorização do usuário precisa incluir acesso a Produtos.</p>
        {isEditing && <div className={`product-bling-sync-status ${blingSync.status}`} role="status">
          <strong>Status: {blingSync.status === 'synced' ? 'Sincronizado' : blingSync.status === 'partial' ? 'Parcial' : blingSync.status === 'syncing' ? 'Sincronizando' : blingSync.status === 'uncertain' ? 'Resultado incerto' : 'Pendente / falhou'}</strong>
          {blingSync.error && <span>{blingSync.error}</span>}
          <button type="button" className="editor-link" onClick={() => void retryBlingSync()} disabled={retryingBling || blingSync.status === 'syncing'}>
            {retryingBling ? 'Sincronizando…' : blingSync.status === 'uncertain' ? 'Verificar no Bling' : 'Sincronizar novamente'}
          </button>
        </div>}
        {!isEditing && <p className="editor-hint">A sincronização será tentada após o primeiro salvamento.</p>}
      </section>}
      {activeTab === 'Preço' && <><section className="editor-card"><h2>Preços e markup</h2><div className="editor-form-grid three">{field(product.saleUnit === 'Quilograma' ? 'Custo por kg' : 'Custo de compra', 'cost', 'currency')}{field(product.saleUnit === 'Quilograma' ? 'Preço de venda por kg' : 'Preço de venda', 'price', 'currency')}{field(product.saleUnit === 'Quilograma' ? 'Preço promocional por kg' : 'Preço promocional', 'promotionalPrice', 'currency')}{field('Desconto (%)', 'discount', 'number')}{field('Margem de lucro (%)', 'profitMarginPercent', 'number')}{field('Margem de lucro (R$)', 'profitMarginValue', 'currency')}{field('Markup (%)', 'markupPercent', 'text', { inputMode: 'decimal' })}</div><div className="effective-price-note">Preço efetivo considerado: <strong>{product.effectivePrice || 'informe os preços'}</strong><small>Usa o preço promocional quando informado; caso contrário, usa o preço de venda.</small></div><p className="editor-hint">O markup calcula automaticamente: custo de compra × (1 + markup ÷ 100) = preço de venda. Promoção e desconto atualizam a margem com base no preço efetivo.</p><div className="markup-suggestion"><strong>Sugestão para {selectedSuggestionCategory || 'a categoria selecionada'}</strong><span>Markup sugerido: {product.suggestedMarkup || 'selecione uma categoria'}</span><small>{markupStrategy[selectedSuggestionCategory] || 'Escolha uma categoria para receber uma referência de precificação.'}</small></div><label>Tipo de preço<select value={product.priceType} onChange={(event) => update('priceType', event.target.value)}><option>Normal</option>{priceTypes.map((type) => <option key={type}>{type}</option>)}</select></label><div className="product-classification-guide"><p><strong>Tipo de preço:</strong> classifica a estratégia comercial. Ele, sozinho, não altera o valor nem cria um selo na loja.</p><p><strong>Tipos de vitrine:</strong> definem os selos que aparecem no card do produto.</p><ul><li><strong>Oferta:</strong> selo no card, carrossel “Ofertas em destaque” e página de ofertas.</li><li><strong>Promoção, Clube Hoje e Super Hoje:</strong> exibem os respectivos selos no card.</li></ul></div><p className="editor-hint">Tipos de vitrine — selecione todos os selos que devem aparecer no produto.</p><div className="price-type-bubbles">{priceTypes.map((type) => <button type="button" key={type} className={product.featuredPriceTypes.includes(type) ? 'active' : ''} onClick={() => togglePriceType(type)}>{type}</button>)}</div></section><section className="editor-card"><h2>Promoção</h2><div className="editor-form-grid three">{field('Data inicial', 'promotionStart', 'date')}{field('Data final', 'promotionEnd', 'date')}{field('Limite por cliente', 'promotionLimit', 'number')}{field('Estoque promocional', 'promotionStock', 'number')}{field('Tipo de promoção', 'promotionType')}</div></section></>}
      {activeTab === 'Estoque' && <><section className="editor-card">
        <h2>Estoque e rastreabilidade</h2>
        <div className="editor-form-grid three">
          {isEditing
            ? field(product.saleUnit === 'Quilograma' ? 'Saldo total em estoque (kg)' : 'Saldo total em estoque', 'quantity', 'number', { readOnly: true, step: '0.001' })
            : <div className="editor-first-lot-note"><strong>Estoque inicial</strong><p>Após salvar o produto, o formulário Registrar lote abrirá para você informar a quantidade, o código e a validade do primeiro lote.</p></div>}
          {field(product.saleUnit === 'Quilograma' ? 'Estoque mínimo (kg)' : 'Estoque mínimo', 'minStock', 'number')}
          {field(product.saleUnit === 'Quilograma' ? 'Estoque máximo (kg)' : 'Estoque máximo', 'maxStock', 'number')}
          {field('Localização padrão', 'location')}
          {field('Número de série', 'serialNumber')}
          {field('Validade mínima para venda', 'minimumShelfLife')}
        </div>
        <section className="editor-expiry-section" aria-labelledby="product-expiry-heading">
          <header className="editor-expiry-heading">
            <CalendarClock size={19} aria-hidden="true" />
            <div>
              <h3 id="product-expiry-heading">Validade e fabricação</h3>
              <p>Defina o prazo padrão e informe como controlar a validade de cada lote.</p>
            </div>
          </header>
          <div className="editor-expiry-default">
            {field('Prazo padrão de validade (dias)', 'shelfLifeDays', 'number', { min: '1', max: '36500', step: '1', placeholder: 'Ex.: 90' })}
            <p>{isEditing
              ? 'Alterar o prazo padrão não modifica os lotes já registrados; ele fica como sugestão para novas entradas.'
              : 'Este prazo será sugerido ao registrar os lotes, mas poderá ser ajustado em cada entrada.'}</p>
          </div>
          {isEditing
            ? <div className="editor-expiry-manage-card">
              <div>
                <strong>Datas dos lotes existentes</strong>
                <p>Cada lote tem sua própria fabricação e validade. Altere-as sem afetar os demais lotes ou registre uma nova entrada.</p>
              </div>
              <div className="editor-expiry-actions">
                <Link className="editor-expiry-register-link" href={`/erp/registrar-lote?productId=${encodeURIComponent(editId)}`}>
                  <Plus size={16} aria-hidden="true" />
                  <span>Registrar lote</span>
                </Link>
                <Link className="editor-expiry-manage-link" href={`/erp/validade?productId=${encodeURIComponent(editId)}`}>
                  <CalendarClock size={16} aria-hidden="true" />
                  <span>Editar datas dos lotes</span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
            : <p className="editor-first-lot-help">Após salvar, a página <strong>Registrar lote</strong> será aberta para informar o estoque inicial, a fabricação e a validade. O prazo padrão acima será sugerido quando o lote usar validade em dias.</p>}
        </section>
        <div className="editor-toggle-grid"><label><input type="checkbox" checked={product.controlsLot} onChange={(event) => update('controlsLot', event.target.checked)} /> Controla lote</label><label><input type="checkbox" checked={product.controlsExpiry} onChange={(event) => update('controlsExpiry', event.target.checked)} /> Controla validade</label><label><input type="checkbox" checked={product.perishable} onChange={(event) => update('perishable', event.target.checked)} /> Perecível</label></div>
      </section></>}
      {activeTab === 'Logística' && <section className="editor-card"><h2>Logística e conservação</h2><div className="editor-form-grid three">{field('Peso', 'weight')}{field('Altura', 'height')}{field('Largura', 'width')}{field('Comprimento', 'length')}{field('Peso da embalagem', 'packageWeight')}{field('Tipo de embalagem', 'packageType')}{field('Unidade de transporte', 'transportUnit')}<label>Forma de venda<select value={product.saleUnit} onChange={(event) => update('saleUnit', event.target.value)}><option value="Unidade">Unidade</option><option value="Quilograma">Quilograma (preço por kg)</option></select></label></div>{product.saleUnit === 'Quilograma' && <p className="editor-hint">Na loja, o primeiro clique adiciona 100 g. Cada + ou − altera o peso em 100 g; informe preço e estoque por kg.</p>}<div className="editor-toggle-grid"><label><input type="checkbox" checked={product.fragile} onChange={(event) => update('fragile', event.target.checked)} /> Frágil</label><label><input type="checkbox" checked={product.refrigerated} onChange={(event) => update('refrigerated', event.target.checked)} /> Refrigerado</label><label><input type="checkbox" checked={product.frozen} onChange={(event) => update('frozen', event.target.checked)} /> Congelado</label><label><input type="checkbox" checked={product.roomTemperature} onChange={(event) => update('roomTemperature', event.target.checked)} /> Temperatura ambiente</label><label><input type="checkbox" checked={product.specialCare} onChange={(event) => update('specialCare', event.target.checked)} /> Cuidado especial</label></div></section>}
      {activeTab === 'Loja' && <><section className="editor-card"><h2>Imagem da loja</h2><div className="media-dropzone"><ImagePlus size={28} /><strong>Selecione uma imagem</strong><span>A imagem será exibida na loja.</span><input type="file" accept="image/*" onChange={readImage} /></div>{product.image && <div className="media-preview-grid"><img src={product.image} alt="Prévia do produto" /></div>}</section><section className="editor-card"><h2>Tags e fornecedores</h2><div className="editor-inline"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Ex.: sem lactose" /><button type="button" className="editor-link" onClick={() => addListValue('tags', newTag, setNewTag)}><Plus size={15} /> Adicionar tag</button></div><div className="editor-chip-list">{product.tags.map((tag) => <span key={tag}>{tag}<button type="button" onClick={() => removeListValue('tags', tag)} aria-label={`Remover tag ${tag}`}><Trash2 size={13} /></button></span>)}</div><p className="editor-hint">Fornecedores alternativos e dados de compra podem ser adicionados depois no mesmo cadastro.</p></section></>}
      {activeTab === 'SEO' && <section className="editor-card"><h2>SEO e descoberta</h2>{field('Título SEO', 'seoTitle')}{field('URL amigável', 'seoSlug')}<label>Meta descrição<textarea value={product.metaDescription || ''} onChange={(event) => update('metaDescription', event.target.value)} rows="4" /></label>{field('Palavras-chave', 'seoKeywords')}</section>}
    </main><aside className="product-editor-side"><section className="editor-card"><h2>Resumo</h2><p className="editor-hint">Preencha as abas para manter preço, estoque, logística e vitrine consistentes.</p><span className="status-pill ok">{product.status}</span></section></aside></div>
    {isEditing && <section className="editor-card product-audit-history"><h2>Auditoria do produto</h2><p>Histórico persistente de cadastro e alterações, com responsável, data e valores registrados.</p>{auditLoading && <p>Carregando auditoria...</p>}{auditError && <p role="alert">{auditError}</p>}{!auditLoading && !auditError && auditEntries.length === 0 && <p>Nenhum registro de auditoria disponível para este produto.</p>}{auditEntries.map((entry) => { const fields = entry.changes && typeof entry.changes === 'object' ? Object.entries(entry.changes) : Object.entries(entry.snapshot || {}); return <details className="product-audit-entry" key={entry.id}><summary><strong>{auditActionLabels[entry.action] || entry.action}</strong><span>{formatAuditDate(entry.occurredAt)} · {entry.actor}</span></summary>{entry.note && <p>{entry.note}</p>}{fields.length > 0 && <dl>{fields.map(([key, value]) => <div key={key}><dt>{auditFieldLabels[key] || key}</dt>{entry.changes ? <dd>De: {formatAuditValue(value?.before)} <span aria-hidden="true">→</span> Para: {formatAuditValue(value?.after)}</dd> : <dd>{formatAuditValue(value)}</dd>}</div>)}</dl>}</details>; })}</section>}
    {feedback && <div className={`editor-saved ${createdProductReference || (isEditing && ['failed', 'uncertain'].includes(blingSync.status)) ? 'error' : ''}`} role={createdProductReference || (isEditing && ['failed', 'uncertain'].includes(blingSync.status)) ? 'alert' : 'status'}>
      {createdProductReference || (isEditing && ['failed', 'uncertain'].includes(blingSync.status)) ? <AlertCircle size={15} /> : <Check size={15} />} {feedback}
      {createdProductReference && <>
        <Link href={`/erp/products/cadastro?edit=${encodeURIComponent(createdProductReference)}&tab=Fiscal`}>Abrir cadastro e revisar sincronização</Link>
        <Link href={`/erp/registrar-lote?productId=${encodeURIComponent(createdProductReference)}`}>Continuar para registrar o lote</Link>
      </>}
    </div>}
  </form>;
}
