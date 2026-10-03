export const STORE_LAYOUT_SLOTS = [
  {
    key: 'main-hero',
    label: 'Banner principal da Loja',
    placement: 'Topo da página inicial',
    recommendedWidth: 1600,
    recommendedHeight: 500,
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

export function getStoreLayoutSlot(key) {
  return STORE_LAYOUT_SLOTS.find((slot) => slot.key === key) || null;
}

export function validateStoreLayoutImage(imageData) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(imageData || ''));
  if (!match) return null;

  const encoded = match[2];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = Math.floor(encoded.length * 3 / 4) - padding;
  const signatures = { 'image/png': 'iVBORw0KGgo', 'image/jpeg': '/9j/', 'image/webp': 'UklGR' };
  if (encoded.length % 4 !== 0
    || !decodedLength
    || decodedLength > 2_500_000
    || !encoded.startsWith(signatures[match[1]])) return null;

  return { contentType: match[1], imageData: encoded };
}
