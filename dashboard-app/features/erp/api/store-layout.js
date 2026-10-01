export const STORE_LAYOUT_SLOTS = [
  {
    key: 'main-hero',
    label: 'Banner principal da Loja',
    placement: 'Topo da página inicial',
    recommendedWidth: 1600,
    recommendedHeight: 500,
    fallbackImage: '/imagens/tudo_o_que_vc_precisa.png',
  },
  {
    key: 'vendor-feature',
    label: 'Banner Produtos Hoje',
    placement: 'Destaque após o carrossel de ofertas',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-fresco',
    label: 'Banner Mercearia',
    placement: 'Seção de Mercearia',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-limpeza',
    label: 'Banner Limpeza',
    placement: 'Seção de Produtos de Limpeza',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-roupas',
    label: 'Banner Lavanderia',
    placement: 'Seção de Lavanderia',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-vinho1',
    label: 'Banner Vinhos',
    placement: 'Seção de Vinhos',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-vinho2',
    label: 'Banner Cervejas',
    placement: 'Seção de Cervejas',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
  },
  {
    key: 'promo-acougue',
    label: 'Banner Açougue',
    placement: 'Seção do Açougue',
    recommendedWidth: 1400,
    recommendedHeight: 360,
    fallbackImage: '',
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
