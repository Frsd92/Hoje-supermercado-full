import { validateImageDataUrl } from '../../../lib/image-data.js';

export const STORE_LAYOUT_SLOTS = [
  {
    key: 'main-hero',
    label: 'Banner principal da Loja',
    placement: 'Topo da página inicial',
    recommendedWidth: 1644,
    recommendedHeight: 760,
    fallbackImage: '/imagens/tudo_o_que_vc_precisa.webp',
    group: 'main',
  },
  {
    key: 'vendor-feature',
    label: 'Banner Produtos Hoje',
    placement: 'Destaque após o carrossel de ofertas',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'carousel-hortifruti',
    label: 'Banner do carrossel Hortifruti',
    placement: 'Painel lateral do carrossel Hortifruti',
    recommendedWidth: 520,
    recommendedHeight: 700,
    fallbackImage: '',
    group: 'carousels',
  },
  {
    key: 'carousel-mercearia',
    label: 'Banner do carrossel Mercearia',
    placement: 'Painel lateral do carrossel Mercearia',
    recommendedWidth: 520,
    recommendedHeight: 700,
    fallbackImage: '',
    group: 'carousels',
  },
  {
    key: 'carousel-limpeza',
    label: 'Banner do carrossel Produtos de Limpeza',
    placement: 'Painel lateral do carrossel Produtos de Limpeza',
    recommendedWidth: 520,
    recommendedHeight: 700,
    fallbackImage: '',
    group: 'carousels',
  },
  {
    key: 'promo-fresco',
    label: 'Banner Mercearia',
    placement: 'Seção de Mercearia',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'promo-limpeza',
    label: 'Banner Limpeza',
    placement: 'Seção de Produtos de Limpeza',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'promo-roupas',
    label: 'Banner Lavanderia',
    placement: 'Seção de Lavanderia',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'promo-vinho1',
    label: 'Banner Vinhos',
    placement: 'Seção de Vinhos',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'promo-vinho2',
    label: 'Banner Cervejas',
    placement: 'Seção de Cervejas',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'promo-acougue',
    label: 'Banner Açougue',
    placement: 'Seção do Açougue',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
    group: 'wide-banners',
  },
  {
    key: 'brand-coca-cola',
    label: 'Logo Coca-Cola',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/Coca-Cola.png',
    group: 'brands',
  },
  {
    key: 'brand-ambev',
    label: 'Logo Ambev',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/ype-optimized.webp',
    group: 'brands',
  },
  {
    key: 'brand-heineken',
    label: 'Logo Heineken',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/heineken2.svg',
    group: 'brands',
  },
  {
    key: 'brand-danone',
    label: 'Logo Danone',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/Danone.png',
    group: 'brands',
  },
  {
    key: 'brand-pg',
    label: 'Logo P&G',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/P-G.webp',
    group: 'brands',
  },
  {
    key: 'brand-unilever',
    label: 'Logo Unilever',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/Unilever.webp',
    group: 'brands',
  },
  {
    key: 'brand-seara',
    label: 'Logo Seara',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/seara.svg',
    group: 'brands',
  },
  {
    key: 'brand-omo',
    label: 'Logo OMO',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/OMO.webp',
    group: 'brands',
  },
  {
    key: 'brand-colgate',
    label: 'Logo Colgate',
    placement: 'Carrossel Marcas em destaque',
    recommendedWidth: 480,
    recommendedHeight: 200,
    fallbackImage: '/imagens/marcas_em_destaque/Colgate.png',
    group: 'brands',
  },
];

const MAIN_HERO_DEFAULT_TITLE = 'Tudo o que você precisa, em um só lugar!';
const MAIN_HERO_DEFAULT_DESCRIPTION = 'Qualidade, variedade e os melhores preços para o seu dia a dia.';

export function getDefaultMainHeroSlideSettings(key) {
  const isOriginalSlide = key === 'main-hero';
  return {
    showLogo: isOriginalSlide,
    showText: isOriginalSlide,
    title: isOriginalSlide ? MAIN_HERO_DEFAULT_TITLE : '',
    description: isOriginalSlide ? MAIN_HERO_DEFAULT_DESCRIPTION : '',
    showButton: isOriginalSlide,
    buttonLabel: 'Ver ofertas',
    buttonHref: '#store-offers',
  };
}

export function getMainHeroSlideSettings(settings, key) {
  const defaults = getDefaultMainHeroSlideSettings(key);
  if (!settings) return defaults;
  return Object.fromEntries(Object.keys(defaults).map((field) => [
    field,
    settings[field] ?? defaults[field],
  ]));
}

export function validateMainHeroSlideSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { showLogo, showText, title, description, showButton, buttonLabel, buttonHref } = value;
  if ([showLogo, showText, showButton].some((enabled) => typeof enabled !== 'boolean')) return null;
  if (typeof title !== 'string' || title.length > 100) return null;
  if (typeof description !== 'string' || description.length > 180) return null;
  if (typeof buttonLabel !== 'string' || buttonLabel.trim().length > 32) return null;
  if (typeof buttonHref !== 'string' || buttonHref.trim().length > 300) return null;

  const href = buttonHref.trim();
  if (!href || /[\u0000-\u0020\\]/.test(href) || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null;
  if (!href.startsWith('/') && !href.startsWith('#')) return null;

  return {
    showLogo,
    showText,
    title: title.trim(),
    description: description.trim(),
    showButton,
    buttonLabel: buttonLabel.trim() || 'Ver ofertas',
    buttonHref: href,
  };
}

export function getStoreLayoutSlot(key) {
  const slot = STORE_LAYOUT_SLOTS.find((item) => item.key === key);
  if (slot) return slot;

  const match = /^main-hero-slide-(\d{2,4})$/.exec(String(key));
  if (!match) return null;
  const position = Number(match[1]);
  if (position < 2 || position > 9999) return null;

  const mainHero = STORE_LAYOUT_SLOTS[0];
  return {
    ...mainHero,
    key,
    label: `Banner principal ${position}`,
    fallbackImage: '',
  };
}

export function isMainHeroSlideKey(key) {
  return key === 'main-hero' || /^main-hero-slide-(\d{2,4})$/.test(String(key));
}

export function getMainHeroSlideOrder(key) {
  if (key === 'main-hero') return 1;
  const match = /^main-hero-slide-(\d{2,4})$/.exec(String(key));
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function getMainHeroBanners(savedAssets, savedSettings = []) {
  const settingsByKey = new Map(savedSettings.map((settings) => [settings.key, settings]));
  const banners = savedAssets
    .filter((asset) => isMainHeroSlideKey(asset.key))
    .sort((first, second) => getMainHeroSlideOrder(first.key) - getMainHeroSlideOrder(second.key))
    .map((asset) => ({
      key: asset.key,
      imageUrl: `/api/store-layout/${asset.key}?v=${asset.updatedAt.getTime()}`,
      settings: getMainHeroSlideSettings(settingsByKey.get(asset.key), asset.key),
    }));

  if (!banners.some((banner) => banner.key === 'main-hero')) {
    banners.unshift({
      key: 'main-hero',
      imageUrl: getStoreLayoutSlot('main-hero').fallbackImage,
      settings: getMainHeroSlideSettings(settingsByKey.get('main-hero'), 'main-hero'),
    });
  }

  return banners;
}

export function validateStoreLayoutImage(imageData) {
  return validateImageDataUrl(imageData);
}
