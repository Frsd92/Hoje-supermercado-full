'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, LayoutTemplate, LoaderCircle, Save, Trash2 } from 'lucide-react';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ENCODED_LENGTH = 3_300_000;

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo escolhido.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('O arquivo escolhido não é uma imagem válida.'));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

function prepareLayoutImage(image) {
  const initialScale = Math.min(1, 1800 / Math.max(image.width, image.height));
  let canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * initialScale));
  canvas.height = Math.max(1, Math.round(image.height * initialScale));
  let context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem para envio.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const transparent = context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value < 255);

  while (true) {
    const imageData = transparent
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/webp', 0.84);
    if (imageData.length <= MAX_ENCODED_LENGTH) return imageData;
    if (Math.max(canvas.width, canvas.height) <= 320) {
      throw new Error('A imagem ficou muito grande mesmo após a compressão. Escolha uma imagem menor.');
    }

    const scale = Math.max(0.65, Math.min(0.82, 1400 / Math.max(canvas.width, canvas.height)));
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    resizedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const resizedContext = resizedCanvas.getContext('2d');
    if (!resizedContext) throw new Error('Não foi possível comprimir a imagem.');
    resizedContext.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
    canvas = resizedCanvas;
  }
}

function formatUpdatedAt(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export default function StoreLayoutPage() {
  const [slots, setSlots] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [actualSizes, setActualSizes] = useState({});
  const [activeView, setActiveView] = useState('main');
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadSlots = useCallback(async () => {
    const response = await fetch('/api/erp/store-layout', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as imagens do layout.');
    setSlots(data.slots || []);
  }, []);

  useEffect(() => {
    loadSlots()
      .catch((loadError) => setError(loadError.message || 'Não foi possível carregar as imagens do layout.'))
      .finally(() => setLoading(false));
  }, [loadSlots]);

  const selectImage = async (slot, file) => {
    setError('');
    setFeedback('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use uma imagem PNG, JPEG ou WebP. SVG e outros formatos não são aceitos.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('A imagem original deve ter no máximo 10 MB.');
      return;
    }

    try {
      const source = await readFile(file);
      const image = await loadImage(source);
      const imageData = prepareLayoutImage(image);
      setDrafts((current) => ({
        ...current,
        [slot.key]: { imageData, originalName: file.name, width: image.width, height: image.height },
      }));
      setActualSizes((current) => ({ ...current, [slot.key]: `${image.width} × ${image.height} px` }));
      setFeedback(`Imagem preparada para “${slot.label}”. Salve para publicar na Loja.`);
    } catch (prepareError) {
      setError(prepareError.message || 'Não foi possível preparar esta imagem.');
    }
  };

  const saveImage = async (slot) => {
    const draft = drafts[slot.key];
    if (!draft) return;

    setSavingKey(slot.key);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/erp/store-layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: slot.key, imageData: draft.imageData, originalName: draft.originalName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar esta imagem.');
      await loadSlots();
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setFeedback(`Imagem de “${slot.label}” atualizada na Loja.`);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar esta imagem.');
    } finally {
      setSavingKey('');
    }
  };

  const removeImage = async (slot) => {
    if (!slot.imageUrl || !window.confirm(`Remover a imagem personalizada de “${slot.label}” e voltar à imagem original?`)) return;

    setSavingKey(slot.key);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(`/api/erp/store-layout?key=${encodeURIComponent(slot.key)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover esta imagem.');
      await loadSlots();
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setFeedback(`Imagem personalizada de “${slot.label}” removida. A Loja voltou à imagem original.`);
    } catch (removeError) {
      setError(removeError.message || 'Não foi possível remover esta imagem.');
    } finally {
      setSavingKey('');
    }
  };

  const bannerSlots = slots.filter((slot) => slot.group !== 'brands');
  const brandSlots = slots.filter((slot) => slot.group === 'brands');
  const bannerCategories = [
    {
      key: 'main',
      label: 'Banner principal',
      title: 'Banner principal',
      description: 'Imagem de destaque no topo da página inicial.',
      slots: bannerSlots.filter((slot) => slot.group === 'main'),
    },
    {
      key: 'carousels',
      label: 'Banners dos carrosséis',
      title: 'Banners dos carrosséis',
      description: 'Painéis laterais exibidos ao lado dos produtos nos carrosséis de categoria.',
      slots: bannerSlots.filter((slot) => slot.group === 'carousels'),
    },
    {
      key: 'wide-banners',
      label: 'Banners largos',
      title: 'Banners largos acima dos carrosséis',
      description: 'Faixas horizontais posicionadas antes dos carrosséis ou seções de produtos.',
      slots: bannerSlots.filter((slot) => slot.group === 'wide-banners'),
    },
  ].filter((group) => group.slots.length > 0);
  const layoutCategories = [
    ...bannerCategories,
    {
      key: 'brands',
      label: 'Marcas em destaque',
      title: 'Logos das marcas em destaque',
      description: 'A mesma logo será atualizada nas duas repetições do carrossel da página inicial.',
      slots: brandSlots,
    },
  ];
  const activeCategory = layoutCategories.find((category) => category.key === activeView) || layoutCategories[0];
  const activeSlots = activeCategory.slots;
  const customizedActiveCount = activeSlots.filter((slot) => slot.imageUrl).length;
  const pendingActiveCount = activeSlots.filter((slot) => drafts[slot.key]).length;
  const renderSlots = (items) => items.map((slot) => {
    const draft = drafts[slot.key];
    const preview = draft?.imageData || slot.imageUrl || slot.fallbackImage;
    const saving = savingKey === slot.key;
    const isBrandLogo = slot.group === 'brands';
    const imageLabel = isBrandLogo ? 'logo' : 'arte';
    return <article className="store-layout-card" key={slot.key}>
      <div className="store-layout-card-heading"><div><span className="store-layout-location">{slot.placement}</span><h2>{slot.label}</h2></div><span className={`store-layout-status ${slot.imageUrl || draft ? 'customized' : ''}`}>{draft ? 'Alteração pendente' : slot.imageUrl ? `${isBrandLogo ? 'Logo' : 'Arte'} personalizada` : `${isBrandLogo ? 'Logo' : 'Arte'} padrão`}</span></div>
      <div className={`store-layout-preview ${isBrandLogo ? 'store-layout-brand-preview' : ''}`}>
        {preview
          ? <img src={preview} alt={`Prévia: ${slot.label}`} onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            setActualSizes((current) => ({ ...current, [slot.key]: `${naturalWidth} × ${naturalHeight} px` }));
          }} />
          : <div className="store-layout-preview-empty"><ImagePlus size={26} /><span>Nenhuma imagem personalizada</span></div>}
      </div>
      <div className="store-layout-dimensions"><span>{isBrandLogo ? 'Logo recomendada' : 'Arte recomendada'}</span><strong>{slot.recommendedWidth} × {slot.recommendedHeight} px</strong><small>{actualSizes[slot.key] ? `Imagem atual: ${actualSizes[slot.key]}` : isBrandLogo ? 'Preserve a proporção e prefira fundo transparente' : 'Proporção sugerida para melhor encaixe'}</small></div>
      {slot.updatedAt && <p className="store-layout-updated">Atualizada em {formatUpdatedAt(slot.updatedAt)} por {slot.updatedBy || 'usuário ERP'}</p>}
      <div className="store-layout-actions">
        <label className="store-layout-upload"><ImagePlus size={15} /> {isBrandLogo ? 'Escolher logo' : 'Escolher arte'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(event) => {
          selectImage(slot, event.target.files?.[0]);
          event.target.value = '';
        }} /></label>
        <button type="button" className="primary-cta" disabled={!draft || saving} onClick={() => saveImage(slot)}>{saving ? <LoaderCircle size={15} className="store-layout-spinner" /> : <Save size={15} />}{saving ? 'Salvando...' : isBrandLogo ? 'Salvar logo' : 'Salvar na Loja'}</button>
        {slot.imageUrl && <button type="button" className="store-layout-remove" disabled={saving} onClick={() => removeImage(slot)}><Trash2 size={15} />Remover {imageLabel}</button>}
      </div>
    </article>;
  });

  return <div className="erp-page store-layout-page">
    <header className="store-layout-header">
      <div><span className="eyebrow">Personalização da Loja</span><h1>Layout da Loja</h1><p>Gerencie as imagens por área da Loja. Escolha uma categoria para encontrar e atualizar cada banner ou logo.</p></div>
      <span className="store-layout-header-icon"><LayoutTemplate size={22} /></span>
    </header>

    <details className="store-layout-art-hint">
      <summary><strong>Orientações para imagens</strong><span>Formatos aceitos e recomendações</span></summary>
      <p>São aceitos PNG, JPEG e WebP de até 10 MB antes da compressão. SVG não é aceito. A transparência é preservada; para logos, prefira PNG ou WebP com fundo transparente. Use as dimensões indicadas em cada espaço como referência.</p>
    </details>
    {error && <div className="store-layout-message error" role="alert">{error}</div>}
    {feedback && <div className="store-layout-message" role="status">{feedback}</div>}
    {loading && <div className="erp-empty-data">Carregando imagens da Loja...</div>}
    {!loading && !error && <>
      <div className="store-layout-toolbar">
        <div className="store-layout-view-switch" role="group" aria-label="Categoria de imagens">
          {layoutCategories.map((category) => (
            <button type="button" className="store-layout-view-button" aria-pressed={activeView === category.key} onClick={() => setActiveView(category.key)} key={category.key}>
              {category.key === 'brands' ? <ImagePlus size={16} /> : <LayoutTemplate size={16} />}
              {category.label}
              <span className="store-layout-tab-count">{category.slots.length}</span>
            </button>
          ))}
        </div>
        <p className="store-layout-view-summary">
          <strong>{activeSlots.length}</strong> {activeCategory.key === 'brands' ? 'logos' : activeSlots.length === 1 ? 'banner' : 'banners'}
          <span>{customizedActiveCount} com imagem personalizada</span>
          {pendingActiveCount > 0 && <span className="store-layout-pending-count">{pendingActiveCount} {pendingActiveCount === 1 ? 'alteração não salva' : 'alterações não salvas'}</span>}
        </p>
      </div>

      <section className="store-layout-section">
        <header className="store-layout-section-heading">
          <h2>{activeCategory.title}</h2>
          <p>{activeCategory.description}</p>
        </header>
        <div className={`store-layout-grid ${activeCategory.key === 'brands' ? 'store-layout-grid--brands' : ''} ${activeSlots.length === 1 ? 'store-layout-grid--single' : ''}`} aria-label={activeCategory.title}>{renderSlots(activeSlots)}</div>
      </section>
    </>}
  </div>;
}
