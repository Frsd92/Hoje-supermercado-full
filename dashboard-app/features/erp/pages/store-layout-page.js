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

function prepareBannerImage(image) {
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
      const imageData = prepareBannerImage(image);
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
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a imagem do banner.');
      await loadSlots();
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setFeedback(`Imagem de “${slot.label}” atualizada na Loja.`);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar a imagem do banner.');
    } finally {
      setSavingKey('');
    }
  };

  const removeImage = async (slot) => {
    if (!slot.imageUrl || !window.confirm(`Remover a arte personalizada de “${slot.label}” e voltar para o banner padrão?`)) return;

    setSavingKey(slot.key);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(`/api/erp/store-layout?key=${encodeURIComponent(slot.key)}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover a imagem do banner.');
      await loadSlots();
      setDrafts((current) => {
        const next = { ...current };
        delete next[slot.key];
        return next;
      });
      setFeedback(`Arte personalizada de “${slot.label}” removida. A Loja voltou ao banner padrão.`);
    } catch (removeError) {
      setError(removeError.message || 'Não foi possível remover a imagem do banner.');
    } finally {
      setSavingKey('');
    }
  };

  return <div className="erp-page store-layout-page">
    <header className="store-layout-header">
      <div><span className="eyebrow">Personalização da Loja</span><h1>Layout</h1><p>Troque as artes dos banners da Loja. Cada espaço está identificado com sua localização e dimensão recomendada em pixels.</p></div>
      <span className="store-layout-header-icon"><LayoutTemplate size={22} /></span>
    </header>

    <div className="store-layout-art-hint"><strong>Prepare sua arte</strong><span>Use as dimensões recomendadas em cada banner. Imagens transparentes são preservadas; no site, as artes são ajustadas para preencher o espaço e podem sofrer recorte em telas menores.</span></div>
    {error && <div className="store-layout-message error" role="alert">{error}</div>}
    {feedback && <div className="store-layout-message" role="status">{feedback}</div>}
    {loading && <div className="erp-empty-data">Carregando banners da Loja...</div>}
    {!loading && !error && <section className="store-layout-grid" aria-label="Banners disponíveis para personalização">
      {slots.map((slot) => {
        const draft = drafts[slot.key];
        const preview = draft?.imageData || slot.imageUrl || slot.fallbackImage;
        const saving = savingKey === slot.key;
        return <article className="store-layout-card" key={slot.key}>
          <div className="store-layout-card-heading"><div><span className="store-layout-location">{slot.placement}</span><h2>{slot.label}</h2></div><span className={`store-layout-status ${slot.imageUrl || draft ? 'customized' : ''}`}>{draft ? 'Alteração pendente' : slot.imageUrl ? 'Arte personalizada' : 'Arte padrão'}</span></div>
          <div className="store-layout-preview">
            {preview
              ? <img src={preview} alt={`Prévia: ${slot.label}`} onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                setActualSizes((current) => ({ ...current, [slot.key]: `${naturalWidth} × ${naturalHeight} px` }));
              }} />
              : <div className="store-layout-preview-empty"><ImagePlus size={26} /><span>Nenhuma imagem personalizada</span></div>}
          </div>
          <div className="store-layout-dimensions"><span>Arte recomendada</span><strong>{slot.recommendedWidth} × {slot.recommendedHeight} px</strong><small>{actualSizes[slot.key] ? `Imagem atual: ${actualSizes[slot.key]}` : 'Proporção sugerida para melhor encaixe'}</small></div>
          {slot.updatedAt && <p className="store-layout-updated">Atualizada em {formatUpdatedAt(slot.updatedAt)} por {slot.updatedBy || 'usuário ERP'}</p>}
          <div className="store-layout-actions">
            <label className="store-layout-upload"><ImagePlus size={15} /> Escolher arte<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={(event) => {
              selectImage(slot, event.target.files?.[0]);
              event.target.value = '';
            }} /></label>
            <button type="button" className="primary-cta" disabled={!draft || saving} onClick={() => saveImage(slot)}>{saving ? <LoaderCircle size={15} className="store-layout-spinner" /> : <Save size={15} />}{saving ? 'Salvando...' : 'Salvar na Loja'}</button>
            {slot.imageUrl && <button type="button" className="store-layout-remove" disabled={saving} onClick={() => removeImage(slot)}><Trash2 size={15} />Remover banner</button>}
          </div>
        </article>;
      })}
    </section>}
  </div>;
}
