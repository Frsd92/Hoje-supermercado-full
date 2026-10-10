'use client';

import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, LayoutTemplate, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { getMainHeroSlideOrder, getStoreLayoutSlot } from '@/features/erp/api/store-layout';
import { loadImage, MAX_IMAGE_UPLOAD_BYTES, prepareImageData, readImageFile } from '@/lib/image-upload.js';

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
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      setError('A imagem original deve ter no máximo 10 MB.');
      return;
    }

    try {
      const source = await readImageFile(file);
      const image = await loadImage(source);
      const imageData = prepareImageData(image);
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
    const isAdditionalHeroSlide = slot.key.startsWith('main-hero-slide-');
    if (isAdditionalHeroSlide && !slot.imageUrl) {
      if (!window.confirm(`Descartar “${slot.label}” sem salvar?`)) return;
      setSlots((current) => current.filter((item) => item.key !== slot.key));
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setActualSizes((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setFeedback(`“${slot.label}” foi descartado.`);
      return;
    }
    if (!slot.imageUrl) return;
    const confirmationMessage = isAdditionalHeroSlide
      ? `Remover “${slot.label}” do carrossel da Loja?`
      : `Remover a imagem personalizada de “${slot.label}” e voltar à imagem original?`;
    if (!window.confirm(confirmationMessage)) return;

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
      setFeedback(isAdditionalHeroSlide
        ? `“${slot.label}” removido do carrossel da Loja.`
        : `Imagem personalizada de “${slot.label}” removida. A Loja voltou à imagem original.`);
    } catch (removeError) {
      setError(removeError.message || 'Não foi possível remover esta imagem.');
    } finally {
      setSavingKey('');
    }
  };

  const addHeroSlide = () => {
    const usedPositions = new Set(
      slots.filter((slot) => slot.group === 'main').map((slot) => getMainHeroSlideOrder(slot.key)),
    );
    let position = 2;
    while (usedPositions.has(position) && position <= 9999) position += 1;
    const newSlide = getStoreLayoutSlot(`main-hero-slide-${String(position).padStart(2, '0')}`);
    if (!newSlide) {
      setError('Não é possível adicionar mais banners principais.');
      return;
    }
    setError('');
    setFeedback('Escolha uma imagem e salve para adicionar o novo slide à Loja.');
    setSlots((current) => [...current, newSlide].sort((first, second) => (
      getMainHeroSlideOrder(first.key) - getMainHeroSlideOrder(second.key)
    )));
  };

  const bannerSlots = slots.filter((slot) => slot.group !== 'brands');
  const brandSlots = slots.filter((slot) => slot.group === 'brands');
  const bannerCategories = [
    {
      key: 'main',
      label: 'Banner principal',
      title: 'Banner principal',
      description: 'Adicione imagens para criar uma sequência de slides que será exibida automaticamente no topo da página inicial.',
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
  const renderSlots = (items) => items.map((slot, index) => {
    const draft = drafts[slot.key];
    const preview = draft?.imageData || slot.imageUrl || slot.fallbackImage;
    const saving = savingKey === slot.key;
    const isBrandLogo = slot.group === 'brands';
    const imageLabel = isBrandLogo ? 'logo' : 'arte';
    return <article className="store-layout-card" key={slot.key}>
      <div className="store-layout-card-heading"><div><span className="store-layout-location">{slot.placement}{slot.group === 'main' ? ` · Slide ${index + 1}` : ''}</span><h2>{slot.label}</h2></div><span className={`store-layout-status ${slot.imageUrl || draft ? 'customized' : ''}`}>{draft ? 'Alteração pendente' : slot.imageUrl ? `${isBrandLogo ? 'Logo' : 'Arte'} personalizada` : `${isBrandLogo ? 'Logo' : 'Arte'} padrão`}</span></div>
      <div className={`store-layout-preview ${isBrandLogo ? 'store-layout-brand-preview' : ''}`}>
        {preview
          ? <img src={preview} alt={`Prévia: ${slot.label}`} onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            setActualSizes((current) => ({ ...current, [slot.key]: `${naturalWidth} × ${naturalHeight} px` }));
          }} />
          : <div className="store-layout-preview-empty"><ImagePlus size={26} /><span>Nenhuma imagem personalizada</span></div>}
      </div>
      <div className="store-layout-dimensions"><span>{isBrandLogo ? 'Logo recomendada' : 'Arte recomendada'}</span><strong>{slot.recommendedWidth} × {slot.recommendedHeight} px</strong><small>{actualSizes[slot.key] ? `Imagem atual: ${actualSizes[slot.key]}` : isBrandLogo ? 'Preserve a proporção e prefira fundo transparente' : 'Imagem exibida por inteiro, sem recortes'}</small></div>
      {slot.updatedAt && <p className="store-layout-updated">Atualizada em {formatUpdatedAt(slot.updatedAt)} por {slot.updatedBy || 'usuário ERP'}</p>}
      <div className="store-layout-actions">
        <label className="store-layout-upload"><ImagePlus size={15} /> {isBrandLogo ? 'Escolher logo' : slot.group === 'main' ? 'Escolher banner' : 'Escolher arte'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(event) => {
          selectImage(slot, event.target.files?.[0]);
          event.target.value = '';
        }} /></label>
        <button type="button" className="primary-cta" disabled={!draft || saving} onClick={() => saveImage(slot)}>{saving ? <LoaderCircle size={15} className="store-layout-spinner" /> : <Save size={15} />}{saving ? 'Salvando...' : isBrandLogo ? 'Salvar logo' : 'Salvar na Loja'}</button>
        {(slot.imageUrl || slot.key.startsWith('main-hero-slide-')) && <button type="button" className="store-layout-remove" disabled={saving} onClick={() => removeImage(slot)}><Trash2 size={15} />{slot.key.startsWith('main-hero-slide-') && !slot.imageUrl ? 'Descartar slide' : slot.key.startsWith('main-hero-slide-') ? 'Remover slide' : `Remover ${imageLabel}`}</button>}
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
      <p>São aceitos PNG, JPEG e WebP de até 10 MB antes da compressão. SVG não é aceito. A transparência é preservada; para logos, prefira PNG ou WebP com fundo transparente. As dimensões recomendadas são: banner principal 1600 × 500 px; banners dos carrosséis 520 × 700 px; banners largos 1400 × 360 px; marcas em destaque 480 × 200 px. As recomendações não mudaram; as imagens agora são exibidas por inteiro, sem cortes, podendo deixar faixas de fundo conforme a tela.</p>
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
        {activeCategory.key === 'main' && <button type="button" className="store-layout-add-slide" onClick={addHeroSlide}><Plus size={16} /> Adicionar banner ao carrossel</button>}
        <div className={`store-layout-grid ${activeCategory.key === 'brands' ? 'store-layout-grid--brands' : ''} ${activeSlots.length === 1 ? 'store-layout-grid--single' : ''}`} aria-label={activeCategory.title}>{renderSlots(activeSlots)}</div>
      </section>
    </>}
  </div>;
}
