import { createHash } from 'node:crypto';
import { calculateSalePrice } from './product-pricing.js';

function publicImageUrl(product, origin) {
  if (!product.image) return { url: null, warning: null };
  let baseUrl;
  try {
    baseUrl = new URL(origin);
  } catch {
    return { url: null, warning: 'Imagem não sincronizada: a URL pública do ERP não está configurada.' };
  }
  if (baseUrl.protocol !== 'https:') {
    return { url: null, warning: 'Imagem não sincronizada: o Bling precisa acessar uma URL HTTPS.' };
  }

  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(product.image)) {
    if (product.status !== 'Ativo') {
      return { url: null, warning: 'Imagem não sincronizada: ative o produto para disponibilizar sua imagem ao Bling.' };
    }
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(product.image);
    if (!match) return { url: null, warning: 'Imagem não sincronizada: formato de imagem inválido.' };
    const url = new URL('/api/products', baseUrl.origin);
    url.searchParams.set('purpose', 'image');
    url.searchParams.set('id', product.externalId || product.id);
    const version = createHash('sha256').update(product.image).digest('hex').slice(0, 16);
    url.searchParams.set('v', version);
    return { url: url.toString(), warning: null };
  }

  try {
    const url = new URL(product.image, baseUrl.origin);
    if (url.protocol !== 'https:' || url.origin !== baseUrl.origin) throw new Error('Only same-origin HTTPS product images can be shared.');
    return { url: url.toString(), warning: null };
  } catch {
    return { url: null, warning: 'Imagem não sincronizada: use uma imagem HTTPS hospedada no domínio da loja.' };
  }
}

export function buildBlingProductPayload(product, { origin } = {}) {
  const code = String(product.sku || product.externalId || product.id || '').trim().slice(0, 60);
  const name = String(product.title || '').trim();
  const price = calculateSalePrice(product);
  if (!code) throw new Error('Informe um SKU ou identificador para sincronizar o produto com o Bling.');
  if (!name) throw new Error('Informe o nome do produto antes de sincronizar.');
  if (!Number.isFinite(price) || price <= 0) throw new Error('O preço do produto precisa ser maior que zero para sincronizar com o Bling.');

  const image = publicImageUrl(product, origin);
  const barcodes = [...new Set([product.barcode, ...(product.productBarcodes || []).map((entry) => entry.code)]
    .map((value) => String(value || '').replace(/\D/g, ''))
    .filter((value) => value.length >= 8 && value.length <= 14))];
  const ncm = String(product.metadata?.ncm || '').replace(/\D/g, '');
  if (ncm && ncm.length !== 8) throw new Error('O NCM do produto precisa ter 8 dígitos antes de sincronizar.');

  return {
    payload: {
      nome: name.slice(0, 120),
      codigo: code,
      descricaoCurta: String(product.description || '').slice(0, 500),
      ...(product.brand ? { marca: String(product.brand).slice(0, 100) } : {}),
      unidade: product.metadata?.saleUnit === 'Quilograma' ? 'KG' : 'UN',
      preco: price,
      ...(barcodes[0] ? { gtin: barcodes[0] } : {}),
      ...(ncm ? { tributacao: { ncm } } : {}),
      ...(image.url ? { midia: { imagens: { imagensURL: [{ link: image.url }] } } } : {}),
    },
    code,
    warnings: [
      image.warning,
      ncm ? null : 'NCM não informado; o cadastro do produto no Bling ficará sem esse dado fiscal.',
    ].filter(Boolean),
  };
}
